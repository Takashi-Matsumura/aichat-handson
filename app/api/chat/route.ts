import { NextRequest, after } from 'next/server'
import { recordAndClassify } from '@/lib/analytics/record'

const LLAMA_URLS: Record<number, string> = {
  1: process.env.LLAMA_API_URL ?? 'http://localhost:8080',
  2: process.env.LLAMA_API_URL_2 ?? 'http://localhost:8081',
}
const MODEL = process.env.LLAMA_MODEL ?? 'gemma4'
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
  const { messages, thinking, modelIndex } = await request.json()
  const n = modelIndex === 2 ? 2 : 1
  const LLAMA_URL = LLAMA_URLS[n]
  const { sid, setCookieHeader } = getOrCreateSessionId(request)
  const promptText = lastUserMessageContent(messages)

  const allMessages = thinking
    ? [
        {
          role: 'system',
          content:
            'あなたは丁寧に考えてから回答するAIアシスタントです。回答する前に必ず <think> と </think> タグで囲んで日本語で思考プロセスを記述し、その後に最終的な回答を記述してください。',
        },
        ...messages,
      ]
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
      model: MODEL,
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
  return new Response(toClient, { headers })
}

// ---------------------------------------------------------------------------

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
