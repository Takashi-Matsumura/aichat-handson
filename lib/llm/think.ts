// 推論モード(thinking)の思考過程を、日本語の <think>…</think> として書かせるための部品。
//
// Gemma 4 の内蔵の思考(reasoning_content)は英語で書かれ、日本語で書くよう指示しても従わない。
// そこで内蔵の思考は常に無効にし(lib/llama/config.ts の NO_BUILTIN_REASONING)、
// 代わりにプロンプトで日本語の思考を書かせる。タグを書くかどうかをモデル任せにすると
// 書かないことが多いため、assistant の発言の書き出しに "<think>\n" を与えて(プレフィル)、
// 必ず思考から書き始めさせる。
//
// llama.cpp はプレフィル部分をストリームに含めずに続きだけを返すため、クライアントへ流す
// ストリームの先頭に同じ "<think>\n" を足して、画面側(lib/chat/messages.ts の
// appendStreamChunk)がこれまでどおり <think> タグで思考と回答を分けられるようにする。

export const THINKING_SYSTEM_PROMPT =
  'あなたは丁寧に考えてから回答するAIアシスタントです。回答する前に、<think> と </think> の間に日本語で思考プロセスを書き、その後に最終的な回答を書いてください。'

export const THINK_PREFILL = '<think>\n'

// 会話の末尾に、思考の書き出しを与える assistant メッセージを足す。
export function withThinkPrefill<T extends { role: string; content: string }>(messages: T[]): (T | { role: 'assistant'; content: string })[] {
  return [...messages, { role: 'assistant', content: THINK_PREFILL }]
}

// プレフィルした "<think>\n" を、OpenAI互換SSEの1イベントとしてストリームの先頭に足す。
export function prependThinkPrefill(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const event = { choices: [{ index: 0, delta: { content: THINK_PREFILL } }] }
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      },
    }),
  )
}
