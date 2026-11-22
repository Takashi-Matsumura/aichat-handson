// llama.cpp の OpenAI互換SSEで届く reasoning_content(推論対応モデルの内蔵の思考)を、
// content の先頭に <think>…</think> として埋め込み直す。
//
// チャット画面(lib/chat/messages.ts の appendStreamChunk)は content 中の <think> タグで
// 思考過程と回答を分けて表示するため、ここで形式を揃えれば画面側は変更なしで
// モデル本来の思考を表示できる。React・fetch に依存しない(lib/llm/reasoning.test.ts)。

type Delta = { content?: string | null; reasoning_content?: string | null; [key: string]: unknown }
type Chunk = { choices?: { delta?: Delta; [key: string]: unknown }[]; [key: string]: unknown }

export const THINK_OPEN_TAG = '<think>\n'
export const THINK_CLOSE_TAG = '\n</think>\n\n'

// SSEの1行を受け取り、書き換えた1行を返す関数を作る。状態(思考を開始/終了したか)を持つ。
// close() は、思考の途中でストリームが終わった場合に閉じタグを流すための追加行を返す。
export function createReasoningRewriter(): { rewriteLine: (line: string) => string; close: () => string | null } {
  let opened = false
  let closed = false

  function rewriteLine(line: string): string {
    if (!line.startsWith('data: ')) return line
    const payload = line.slice(6).trim()
    if (payload === '[DONE]') {
      // 思考だけで終わった(上限到達など)場合は、終了の合図より前に閉じタグを流す
      const extra = close()
      return extra ? `${extra}\n\n${line}` : line
    }
    let chunk: Chunk
    try {
      chunk = JSON.parse(payload)
    } catch {
      return line
    }
    const delta = chunk.choices?.[0]?.delta
    if (!delta) return line

    const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : ''
    const content = typeof delta.content === 'string' ? delta.content : ''
    if (!reasoning && !content) return line

    let out = ''
    if (reasoning && !closed) {
      if (!opened) {
        out += THINK_OPEN_TAG
        opened = true
      }
      out += reasoning
    }
    if (content) {
      if (opened && !closed) {
        out += THINK_CLOSE_TAG
        closed = true
      }
      out += content
    }
    const { reasoning_content: _omit, ...rest } = delta
    void _omit
    chunk.choices![0].delta = { ...rest, content: out }
    return `data: ${JSON.stringify(chunk)}`
  }

  function close(): string | null {
    if (!opened || closed) return null
    closed = true
    return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: THINK_CLOSE_TAG.trimEnd() } }] })}`
  }

  return { rewriteLine, close }
}

// SSEのバイトストリームに createReasoningRewriter を適用する。
export function rewriteReasoningStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const { rewriteLine, close } = createReasoningRewriter()
  let buffer = ''
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        if (lines.length > 0) controller.enqueue(encoder.encode(lines.map(rewriteLine).join('\n') + '\n'))
      },
      flush(controller) {
        buffer += decoder.decode()
        const extra = close()
        if (extra) controller.enqueue(encoder.encode(`${extra}\n\n`))
        if (buffer) controller.enqueue(encoder.encode(rewriteLine(buffer)))
      },
    }),
  )
}
