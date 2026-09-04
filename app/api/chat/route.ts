import { NextRequest, after } from 'next/server'
import { TOOLS } from '@/lib/tools'
import { executeTool } from '@/lib/execute-tool'
import { recordAndClassify } from '@/lib/analytics/record'

const LLAMA_URLS: Record<number, string> = {
  1: process.env.LLAMA_API_URL ?? 'http://localhost:8080',
  2: process.env.LLAMA_API_URL_2 ?? 'http://localhost:8081',
}
const MODEL = process.env.LLAMA_MODEL ?? 'gemma4'
const MAX_ITERATIONS = Number(process.env.TOOL_MAX_ITERATIONS ?? 5)

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

// ツール経路でモデルに渡す誘導用システムプロンプト
const TOOL_SYSTEM_PROMPT =
  'あなたはインターネット検索ツールを使えるAIアシスタントです。最新の出来事・時事・ニュース・価格・天気・統計など、あなたの学習データに無い、または古くなっている可能性がある情報を尋ねられたら、まず web_search でキーワード検索し、有望な結果を open_url で開いて内容を確認してから回答してください。ユーザーがURLを示した場合は open_url でそのページを読みます。回答の最後に、参照したページのタイトルとURLを必ず示してください。あいさつや一般常識など、あなたの知識で確実に答えられることにはツールを使わないでください。'

export async function POST(request: NextRequest) {
  const { messages, thinking, webSearch, modelIndex } = await request.json()
  const n = modelIndex === 2 ? 2 : 1
  const LLAMA_URL = LLAMA_URLS[n]
  const { sid, setCookieHeader } = getOrCreateSessionId(request)
  const promptText = lastUserMessageContent(messages)

  // Web検索（tool calling）が無効な場合は従来どおりの単純プロキシ（ツールなし）。
  // ハンズオン5ページ目以外（1〜4ページ目）や通常チャットはこちらを通る。
  if (!webSearch) {
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

  // Web検索ON（ハンズオン5ページ目）: tool calling のエージェントループを実行する自前SSEストリーム。
  const convo: ChatMessage[] = [
    { role: 'system', content: TOOL_SYSTEM_PROMPT },
    ...messages,
  ]

  // このラウンド内で確定した最終回答・エラー状態を after() から参照するためのクロージャ経由の受け皿。
  const collected: { text: string; status: 'success' | 'error'; errorMessage?: string } = {
    text: '',
    status: 'success',
  }
  const startedAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        const seen = new Set<string>()

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const { content, toolCalls } = await streamRound(convo, true, send, LLAMA_URL)

          // ツール不要 → 最終回答は既にクライアントへストリーム済み
          if (toolCalls.length === 0) {
            collected.text = content
            send('[DONE]')
            controller.close()
            return
          }

          // ツール呼び出しを履歴に積む
          convo.push({ role: 'assistant', content: content || null, tool_calls: toolCalls })

          for (const call of toolCalls) {
            const args = parseArgs(call.function.arguments)
            send({
              tool_event: { phase: 'start', id: call.id, name: call.function.name, args },
            })

            const key = `${call.function.name}|${call.function.arguments}`
            let result: string
            if (seen.has(key)) {
              result = '（同じツール呼び出しの繰り返しです。これまでに得た情報で回答してください。）'
            } else {
              result = await executeTool(call.function.name, args)
              seen.add(key)
            }

            send({
              tool_event: {
                phase: 'result',
                id: call.id,
                name: call.function.name,
                summary: makeSummary(result),
              },
            })
            convo.push({ role: 'tool', tool_call_id: call.id, content: result })
          }
        }

        // 反復上限に到達 → ツールなしで最終回答を強制（必ず終了する）
        const { content } = await streamRound(convo, false, send, LLAMA_URL)
        collected.text = content
        if (!content.trim()) {
          send({ choices: [{ delta: { content: '（情報を十分に取得できませんでした。質問を変えてお試しください。）' } }] })
        }
        send('[DONE]')
        controller.close()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'エラーが発生しました'
        collected.status = 'error'
        collected.errorMessage = msg
        send({ error: msg })
        send('[DONE]')
        controller.close()
      }
    },
  })

  after(() =>
    recordAndClassify({
      sessionId: sid,
      llamaUrl: LLAMA_URL,
      model: MODEL,
      promptText,
      responseText: collected.text || undefined,
      latencyMs: Date.now() - startedAt,
      status: collected.status,
      errorMessage: collected.errorMessage,
    })
  )

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  }
  if (setCookieHeader) headers['Set-Cookie'] = setCookieHeader
  return new Response(stream, { headers })
}

// ---------------------------------------------------------------------------

type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

// llama.cpp に stream:true で1ラウンド問い合わせ、content はクライアントへ即転送しつつ、
// tool_calls のデルタを再構築して返す。
async function streamRound(
  convo: ChatMessage[],
  withTools: boolean,
  send: (obj: unknown) => void,
  llamaUrl: string
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const body: Record<string, unknown> = { model: MODEL, messages: convo, stream: true }
  if (withTools) {
    body.tools = TOOLS
    body.tool_choice = 'auto'
  }

  let upstream: Response
  try {
    upstream = await fetch(`${llamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('AIサーバーに接続できませんでした。llama.cpp サーバーが起動しているか確認してください。')
  }
  if (!upstream.ok || !upstream.body) {
    throw new Error(await upstream.text().catch(() => 'AIサーバーがエラーを返しました。'))
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  const calls = new Map<number, { id: string; name: string; arguments: string }>()

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
      let parsed: { choices?: { delta?: Delta }[] }
      try {
        parsed = JSON.parse(payload)
      } catch {
        continue
      }
      const delta = parsed.choices?.[0]?.delta
      if (!delta) continue

      // 通常の回答テキストは即クライアントへ転送（真のストリーミングを維持）
      if (delta.content) {
        content += delta.content
        send({ choices: [{ delta: { content: delta.content } }] })
      }
      // reasoning_content（Gemma の内部推論）は既存挙動同様に無視

      // tool_calls のデルタを index ごとに連結
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          const cur = calls.get(idx) ?? { id: '', name: '', arguments: '' }
          if (tc.id) cur.id = tc.id
          if (tc.function?.name) cur.name = tc.function.name
          if (tc.function?.arguments) cur.arguments += tc.function.arguments
          calls.set(idx, cur)
        }
      }
    }
  }

  const toolCalls: ToolCall[] = [...calls.values()]
    .filter((c) => c.name)
    .map((c) => ({
      id: c.id || crypto.randomUUID(),
      type: 'function',
      function: { name: c.name, arguments: c.arguments || '{}' },
    }))

  return { content, toolCalls }
}

type Delta = {
  content?: string
  reasoning_content?: string
  tool_calls?: {
    index?: number
    id?: string
    function?: { name?: string; arguments?: string }
  }[]
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// ツール結果をUI表示用に短く要約（改行を詰めて先頭を切り出す）
function makeSummary(result: string): string {
  const oneLine = result.replace(/\s+/g, ' ').trim()
  return oneLine.length > 200 ? oneLine.slice(0, 200) + '…' : oneLine
}

// 通常経路(tee)で複製したストリームを読み切り、assistantの応答全文とトークン使用量を回収する。
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
