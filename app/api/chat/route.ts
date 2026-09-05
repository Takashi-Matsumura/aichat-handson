import { NextRequest, after } from 'next/server'
import { recordAndClassify } from '@/lib/analytics/record'
import { isModel1Enabled } from '@/lib/settings/store'
import { retrieve } from '@/lib/rag/search'
import { buildContextBlock, toSourceRefs, type SourceRef } from '@/lib/rag/prompt'

// 推論モード(thinking)のsystemプロンプト。RAGのcontextと連結する都合上、定数化する。
const THINKING_SYSTEM_PROMPT =
  'あなたは丁寧に考えてから回答するAIアシスタントです。回答する前に必ず <think> と </think> タグで囲んで日本語で思考プロセスを記述し、その後に最終的な回答を記述してください。'

const LLAMA_URLS: Record<number, string> = {
  1: process.env.LLAMA_API_URL ?? 'http://localhost:8080',
  2: process.env.LLAMA_API_URL_2 ?? 'http://localhost:8081',
}
const MODEL = process.env.LLAMA_MODEL ?? 'gemma4'
// llama.cpp へのリクエストで送るモデル名(MODEL)は環境変数1つの共通値だが、
// 利用状況分析・推定コスト算出のためにはモデル1/2を区別した実際のモデル名が要る。
const ANALYTICS_MODEL_NAMES: Record<number, string> = {
  1: 'gemma-4-12b',
  2: 'gemma-3-4b',
}
// 1リクエストあたりの生成トークン数の上限。モデルが reasoning_content を延々と吐き続けるなど
// 万一ストップトークンに到達しない場合でも、応答時間を必ず有限にするための安全弁。
const MAX_TOKENS = Number(process.env.LLAMA_MAX_TOKENS ?? 2048)

// 受講者を「ログインユーザー」の代わりに識別するための擬似セッションID。
// 認証は行わず、ブラウザに保存されるこのCookieの値をそのまま利用状況分析のキーにする。
const SESSION_COOKIE = 'handson_sid'

// このリクエストの擬似セッションIDを取得(無ければ新規発行)する。
// 新規発行時は呼び出し側でレスポンスに Set-Cookie ヘッダを付与すること。
function getOrCreateSessionId(request: NextRequest): { sid: string; setCookieHeader?: string } {
  const existing = request.cookies.get(SESSION_COOKIE)?.value
  if (existing) return { sid: existing }
  const sid = crypto.randomUUID()
  return { sid, setCookieHeader: `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` }
}

// messages配列の中から直近のユーザー発話(分類対象のプロンプト)を取り出す。
function lastUserMessageContent(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i].content ?? ''
  }
  return ''
}

export async function POST(request: NextRequest) {
  const { messages, thinking, modelIndex, rag } = await request.json()
  const n = modelIndex === 2 ? 2 : 1
  // フロント側の制御をすり抜けて直接APIが叩かれた場合の保険。
  if (n === 1 && !isModel1Enabled()) {
    return Response.json(
      { error: 'このモデルは現在管理者により利用停止中です。もう一方のモデルをご利用ください。' },
      { status: 403 }
    )
  }
  const LLAMA_URL = LLAMA_URLS[n]
  const { sid, setCookieHeader } = getOrCreateSessionId(request)
  const promptText = lastUserMessageContent(messages)

  // RAG: 例外を投げない設計(retrieve内部でtry/catch済み)なので、埋め込みサーバーが
  // 落ちていてもチャット自体は通常どおり動く。
  let sources: SourceRef[] = []
  let ragContext = ''
  if (rag === true) {
    const { hits } = await retrieve(promptText)
    if (hits.length > 0) {
      sources = toSourceRefs(hits)
      ragContext = buildContextBlock(hits)
    }
  }

  // systemメッセージは必ず1個に連結する。Gemmaのチャットテンプレートにはsystemロールが
  // 無く、llama.cpp側で先頭userメッセージへ畳み込まれる。system を複数個並べると
  // テンプレート実装によっては2個目以降が無視される等、環境依存の事故になりうるため。
  // 順序は「振る舞いの指示(思考プロセス) → データ(検索した資料)」。
  // 検索結果が0件のときはcontextを足さない。「資料はありませんでした」と書くと
  // モデルがそれに引きずられて回答自体を拒否しがちになるため、素のLLMとして答えさせる。
  const systemParts: string[] = []
  if (thinking) systemParts.push(THINKING_SYSTEM_PROMPT)
  if (ragContext) systemParts.push(ragContext)
  const allMessages = systemParts.length > 0
    ? [{ role: 'system', content: systemParts.join('\n\n---\n\n') }, ...messages]
    : messages
  let upstream: Response
  try {
    upstream = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: allMessages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: MAX_TOKENS,
      }),
    })
  } catch {
    return Response.json(
      { error: 'AIサーバーに接続できませんでした。llama.cpp サーバーが起動しているか確認してください。' },
      { status: 503 }
    )
  }
  if (!upstream.ok) {
    const text = await upstream.text()
    return Response.json({ error: text }, { status: upstream.status })
  }

  // 利用状況分析のため、クライアントへ流すストリームとは別にもう1本複製(tee)して
  // 応答全文とトークン使用量を回収する。tee は同期的な複製で消費順に影響しないため、
  // クライアント側のストリーミング体感は変わらない。
  const [toClient, toSniff] = upstream.body!.tee()
  const startedAt = Date.now()
  after(async () => {
    const { text, usage } = await drainAssistantStream(toSniff)
    await recordAndClassify({
      sessionId: sid,
      llamaUrl: LLAMA_URL,
      model: ANALYTICS_MODEL_NAMES[n] ?? MODEL,
      promptText,
      responseText: text,
      latencyMs: Date.now() - startedAt,
      usage,
    })
  })

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  }
  if (setCookieHeader) headers['Set-Cookie'] = setCookieHeader
  const body = rag === true ? prependSourcesEvent(toClient, sources) : toClient
  return new Response(body, { headers })
}

// ---------------------------------------------------------------------------

// llama.cpp のSSEをそのまま流す方針は維持したまま、ストリーム先頭に参照資料を
// 1件のdata行として差し込む。既存のクライアント側パーサ(app/page.tsx)は
// `data: ` で始まりJSONとして解析でき、`error`も`choices[0].delta.content`も
// 存在しないイベントとして無視できる形なので、クライアント側の変更なしに
// 混ぜても既存動作を壊さない。
function prependSourcesEvent(stream: ReadableStream<Uint8Array>, sources: SourceRef[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ handson_sources: sources })}\n\n`))
      },
    })
  )
}

// ストリームを読み切り、assistantの応答全文とトークン使用量を回収する。
// クライアントへの配信には使わない（利用状況分析専用）。
async function drainAssistantStream(
  stream: ReadableStream<Uint8Array>
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let usage: { inputTokens?: number; outputTokens?: number } | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') continue
      let parsed: {
        choices?: { delta?: { content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      try {
        parsed = JSON.parse(payload)
      } catch {
        continue
      }
      const delta = parsed.choices?.[0]?.delta?.content
      if (delta) text += delta
      if (parsed.usage) {
        usage = { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens }
      }
    }
  }

  return { text, usage }
}
