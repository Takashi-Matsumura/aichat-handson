// 確認テストのAPI(/api/quiz, /api/quiz/explain)が返す NDJSON を1行ずつ読み、イベントごとに onEvent を呼ぶ。
export async function readNdjsonStream<T>(res: Response, onEvent: (event: T) => void): Promise<void> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let pending = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pending += value
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as T)
    }
  }
}
