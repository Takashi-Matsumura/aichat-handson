// llama.cpp (OpenAI互換API) のストリーミング応答を読む共通処理。

// SSE("data: {...}" 行)から本文の差分(delta.content)を取り出し、届くたびに onContent に渡す。
// 最後まで読んだら finish_reason("stop" / "length" など。無ければ null)を返す。
export async function readChatContentStream(res: Response, onContent: (content: string) => void): Promise<string | null> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let pending = ''
  let finishReason: string | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pending += value
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      let event: { choices?: { delta?: { content?: string }; finish_reason?: string | null }[] }
      try {
        event = JSON.parse(line.slice(6))
      } catch {
        continue
      }
      const choice = event.choices?.[0]
      if (choice?.finish_reason) finishReason = choice.finish_reason
      const content = choice?.delta?.content
      if (content) onContent(content)
    }
  }
  return finishReason
}
