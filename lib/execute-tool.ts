// tool calling のサーバサイド実行ロジック。
//
//   executeTool(name, args) -> LLM に返す文字列
//
// ユーザー要望どおり「curl コマンド」で実際にインターネットへアクセスする
// （Node の fetch/undici は DuckDuckGo の anti-bot に弾かれるため、curl を child_process で実行）。
//   - web_search : curl で DuckDuckGo を検索。弾かれた場合は Wikipedia 検索APIにフォールバック（本番で必ず結果が返る）
//   - open_url   : curl で任意URLを取得し本文テキストを抽出
//
// 安全策: SSRFガード（http/httpsのみ＋内部IP拒否）、タイムアウト、最大サイズ、Content-Typeチェック。
// エラーは例外で落とさず「説明文字列」として返し、エージェントが自己修正できるようにする。

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lookup } from 'node:dns/promises'
import type { ToolName } from './tools'

const execFileAsync = promisify(execFile)

const TIMEOUT_MS = Number(process.env.TOOL_FETCH_TIMEOUT_MS ?? 8000)
const MAX_TEXT_CHARS = Number(process.env.TOOL_MAX_TEXT_CHARS ?? 4000)
const MAX_BYTES = 512 * 1024 // 512KB で読み込み打ち切り
const MAX_REDIRECTS = 3
const MAX_SEARCH_RESULTS = 5

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    switch (name as ToolName) {
      case 'web_search':
        return await runWebSearch(String(args.query ?? '').trim())
      case 'open_url':
        return await runOpenUrl(String(args.url ?? '').trim())
      default:
        return `不明なツール「${name}」が指定されました。`
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return `ツール「${name}」の実行中にエラーが発生しました: ${msg}`
  }
}

// ---------------------------------------------------------------------------
// web_search: curl で DuckDuckGo → 失敗時 Wikipedia 検索API
// ---------------------------------------------------------------------------

export async function runWebSearch(query: string): Promise<string> {
  if (!query) return '検索キーワードが空です。調べたい語句を query に指定してください。'

  let results = await searchDuckDuckGo(query).catch(() => [])
  let source = 'DuckDuckGo'
  if (results.length === 0) {
    results = await searchWikipedia(query).catch(() => [])
    source = 'Wikipedia'
  }

  if (results.length === 0) {
    return `「${query}」の検索結果が得られませんでした。別のキーワードで web_search を試すか、ユーザーに参照したいURLを直接尋ねてください。`
  }

  const lines = results.map(
    (r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
  )
  return `「${query}」の検索結果（${source} / 上位${results.length}件）:\n\n${lines.join(
    '\n\n'
  )}\n\nこの中から関連しそうなURLを open_url で開いて、本文を確認してください。`
}

type SearchResult = { title: string; url: string; snippet: string }

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const { stdout } = await execFileAsync(
    'curl',
    [
      '-sS',
      '-m',
      String(Math.ceil(TIMEOUT_MS / 1000)),
      '-A',
      UA,
      '-H',
      'Accept-Language: ja,en;q=0.8',
      '--proto',
      '=https',
      '--data-urlencode',
      `q=${query}`,
      '--url',
      'https://html.duckduckgo.com/html/',
    ],
    { maxBuffer: 6 * 1024 * 1024, timeout: TIMEOUT_MS + 2000 }
  )
  return parseDuckDuckGo(stdout)
}

function parseDuckDuckGo(html: string): SearchResult[] {
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

  const links: { title: string; url: string }[] = []
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null && links.length < MAX_SEARCH_RESULTS) {
    const url = normalizeDdgUrl(m[1])
    const title = stripTags(m[2]).trim()
    if (url && title) links.push({ title, url })
  }

  const snippets: string[] = []
  while ((m = snippetRe.exec(html)) !== null && snippets.length < links.length) {
    snippets.push(stripTags(m[1]).trim())
  }

  return links.map((l, i) => ({ title: l.title, url: l.url, snippet: snippets[i] ?? '' }))
}

// DDG の href は直URLのこともあれば /l/?uddg=ENCODED のリダイレクト形式のこともある
function normalizeDdgUrl(href: string): string {
  let url = href.trim()
  if (url.startsWith('//')) url = 'https:' + url
  const uddg = url.match(/[?&]uddg=([^&]+)/)
  if (uddg) {
    try {
      return decodeURIComponent(uddg[1])
    } catch {
      /* fall through */
    }
  }
  return url.startsWith('http') ? url : ''
}

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  const api =
    'https://ja.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=' +
    MAX_SEARCH_RESULTS +
    '&srsearch=' +
    encodeURIComponent(query)
  const res = await fetch(api, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return []
  const data = (await res.json()) as {
    query?: { search?: { title: string; snippet: string }[] }
  }
  const hits = data.query?.search ?? []
  return hits.map((h) => ({
    title: h.title,
    url: 'https://ja.wikipedia.org/wiki/' + encodeURIComponent(h.title.replace(/ /g, '_')),
    snippet: stripTags(h.snippet).trim(),
  }))
}

// ---------------------------------------------------------------------------
// open_url: curl で指定URLを開き、本文テキストを抽出して返す
// ---------------------------------------------------------------------------

export async function runOpenUrl(url: string): Promise<string> {
  if (!url) return 'URLが空です。開きたいページの完全なURLを url に指定してください。'

  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // 自分で安全なIPに解決し、そのIPに固定して curl を実行する（リダイレクト先も毎回）。
    // curl 自身に再解決させない＝検証時と取得時で解決結果がずれる DNS リバインディング(TOCTOU)を防ぐ。
    let target: { host: string; port: string; ip: string }
    try {
      target = await resolveSafeTarget(current)
    } catch (e) {
      return `ページを開けませんでした（${current}）: ${e instanceof Error ? e.message : String(e)}`
    }

    let result: { status: number; redirectUrl: string; contentType: string; body: string }
    try {
      result = await curlGet(current, target)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return `ページを開けませんでした（${current}）: ${msg}`
    }

    // リダイレクト（curl は -L を付けていないので自分で追跡）
    if (result.status >= 300 && result.status < 400 && result.redirectUrl) {
      current = result.redirectUrl
      continue
    }
    if (result.status >= 400) {
      return `ページを開けませんでした（HTTP ${result.status}: ${current}）。`
    }
    if (!/text\/html|text\/plain|application\/xhtml/i.test(result.contentType)) {
      return `このページはテキストとして読めませんでした（種類: ${result.contentType || '不明'}）。HTMLページのURLを指定してください。`
    }

    const text = result.contentType.includes('text/plain')
      ? result.body
      : htmlToText(result.body)
    if (!text.trim()) return `ページ本文を抽出できませんでした（${current}）。`

    const clipped = text.length > MAX_TEXT_CHARS
    const body = clipped ? text.slice(0, MAX_TEXT_CHARS) + '…（以下省略）' : text
    return `${current} の内容:\n\n${body}`
  }
  return `リダイレクトが多すぎて開けませんでした（${url}）。`
}

// curl で1回取得。-L は付けず、リダイレクト先・ステータス・Content-Type をメタ行で受け取る。
// target で渡した安全IPに --resolve で接続を固定し、curl による独立した（リバインド可能な）名前解決を封じる。
async function curlGet(
  url: string,
  target: { host: string; port: string; ip: string }
): Promise<{ status: number; redirectUrl: string; contentType: string; body: string }> {
  const MARKER = '\n___CURLMETA___'
  // IPv6 は --resolve では角括弧で囲む
  const pinnedIp = target.ip.includes(':') ? `[${target.ip}]` : target.ip
  let stdout: string
  try {
    const r = await execFileAsync(
      'curl',
      [
        '-sS',
        '-m',
        String(Math.ceil(TIMEOUT_MS / 1000)),
        '-A',
        UA,
        '-H',
        'Accept-Language: ja,en;q=0.8',
        '--proto',
        '=http,https',
        // host:port への接続を検証済みの安全IPに固定（Host/SNI はホスト名のまま）
        '--resolve',
        `${target.host}:${target.port}:${pinnedIp}`,
        '--max-filesize',
        String(MAX_BYTES),
        '-o',
        '-',
        '-w',
        `${MARKER}%{http_code}|%{redirect_url}|%{content_type}`,
        '--url',
        url,
      ],
      { maxBuffer: 6 * 1024 * 1024, timeout: TIMEOUT_MS + 2000 }
    )
    stdout = r.stdout
  } catch (e) {
    throw new Error(curlErrorReason(e))
  }
  const i = stdout.lastIndexOf(MARKER)
  const body = i >= 0 ? stdout.slice(0, i) : stdout
  const meta = i >= 0 ? stdout.slice(i + MARKER.length) : '0||'
  const [code, redirectUrl, contentType] = meta.split('|')
  return {
    status: Number(code) || 0,
    redirectUrl: (redirectUrl ?? '').trim(),
    contentType: contentType ?? '',
    body,
  }
}

// execFile(curl) の失敗からコマンド行を漏らさず短い理由だけ取り出す
function curlErrorReason(e: unknown): string {
  const err = e as { stderr?: string; killed?: boolean; signal?: string }
  if (err.killed || err.signal === 'SIGTERM') return 'タイムアウトしました'
  const stderr = (err.stderr ?? '').toString().trim()
  if (stderr) {
    const line = stderr.split('\n').pop() ?? stderr
    return line.replace(/^curl:\s*/, '').slice(0, 120)
  }
  return '接続エラーが発生しました'
}

// ---------------------------------------------------------------------------
// HTML -> プレーンテキスト（無依存・正規表現ベースの簡易抽出）
// ---------------------------------------------------------------------------

export function htmlToText(html: string): string {
  let s = html
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<(script|style|noscript|svg|head|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  s = s.replace(/[ \t\f\v]+/g, ' ')
  s = s.replace(/\n[ \t]+/g, '\n').replace(/[ \t]+\n/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ''))
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
}

function safeFromCodePoint(cp: number): string {
  try {
    return String.fromCodePoint(cp)
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// SSRF ガード: http/https のみ許可し、ホスト名を自分で解決して安全なIPだけを返す。
// 返したIPを curl に --resolve で固定渡しすることで、curl による独立した再解決
// （検証時と取得時で結果がずれる DNS リバインディング TOCTOU）を防ぐ。
// ---------------------------------------------------------------------------

export async function resolveSafeTarget(
  rawUrl: string
): Promise<{ host: string; port: string; ip: string }> {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error(`不正なURLです: ${rawUrl}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`http/https 以外のURLは開けません: ${u.protocol}`)
  }
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') {
    throw new Error('ローカルホストへのアクセスは禁止されています。')
  }
  const port = u.port || (u.protocol === 'https:' ? '443' : '80')

  // ホスト名（IPリテラルを含む）を解決し、内部・ローカルIPを除外して安全なものだけ残す。
  // ※ IPリテラル（127.0.0.1 / 169.254.169.254 等）も lookup はそのIPを返すのでここで弾ける。
  let addresses: { address: string; family: number }[]
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    throw new Error(`ホスト名を解決できませんでした: ${host}`)
  }
  const safe = addresses.find((a) => !isPrivateIp(a.address))
  if (!safe) {
    throw new Error('内部ネットワーク／ローカルアドレスへのアクセスは禁止されています。')
  }
  return { host, port, ip: safe.address }
}

function isPrivateIp(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return isPrivateIpv4(mapped[1])
  if (ip.includes(':')) return isPrivateIpv6(ip)
  return isPrivateIpv4(ip)
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true // パースできない＝安全側に倒して拒否
  }
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8
  if (a === 127) return true // ループバック
  if (a === 10) return true // プライベート
  if (a === 172 && b >= 16 && b <= 31) return true // プライベート
  if (a === 192 && b === 168) return true // プライベート
  if (a === 169 && b === 254) return true // リンクローカル / クラウドメタデータ
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

function isPrivateIpv6(ip: string): boolean {
  const x = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (x === '::1' || x === '::') return true // ループバック / 未指定
  if (x.startsWith('fe80')) return true // リンクローカル
  if (x.startsWith('fc') || x.startsWith('fd')) return true // ユニークローカル fc00::/7
  return false
}
