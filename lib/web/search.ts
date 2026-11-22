// SearXNG の JSON API で Web検索する。
// RAG(lib/rag/search.ts)と同じく例外を投げない設計にして、SearXNG が落ちていても
// チャット自体は通常どおり動くようにする。

import { WEB_SEARCH_CONFIG, isWebSearchConfigured } from './config'
import { normalizeResults, type WebSourceRef } from './prompt'

export type WebSearchOutcome = {
  sources: WebSourceRef[]
  // 検索自体に失敗した(タイムアウト・接続不可など)場合のみ true。0件ヒットは失敗ではない。
  failed: boolean
}

export async function searchWeb(query: string): Promise<WebSearchOutcome> {
  if (!isWebSearchConfigured() || !query) return { sources: [], failed: true }
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    language: WEB_SEARCH_CONFIG.language,
    // 「最新の話題」に答えられるよう、通常のWeb検索に加えてニュース検索の結果も混ぜる
    categories: 'general,news',
    safesearch: '1',
  })
  try {
    const res = await fetch(`${WEB_SEARCH_CONFIG.searxngUrl}/search?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(WEB_SEARCH_CONFIG.timeoutMs),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(`[web-search] SearXNG returned ${res.status}`)
      return { sources: [], failed: true }
    }
    const data = (await res.json()) as { results?: unknown }
    return { sources: normalizeResults(data.results, WEB_SEARCH_CONFIG.topK), failed: false }
  } catch (err) {
    console.error('[web-search] request failed:', err instanceof Error ? err.message : err)
    return { sources: [], failed: true }
  }
}

// SearXNG が応答するか(=Web検索トグルを有効にできるか)を確認する。
// 受講者が画面を開くたびに叩かれるため、短時間だけ結果を使い回す。
const STATUS_TTL_MS = 30_000
let cachedStatus: { online: boolean; at: number } | null = null

export async function checkWebSearchOnline(): Promise<boolean> {
  if (!isWebSearchConfigured()) return false
  if (cachedStatus && Date.now() - cachedStatus.at < STATUS_TTL_MS) return cachedStatus.online
  let online = false
  try {
    const res = await fetch(`${WEB_SEARCH_CONFIG.searxngUrl}/healthz`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })
    online = res.ok
  } catch {
    online = false
  }
  cachedStatus = { online, at: Date.now() }
  return online
}
