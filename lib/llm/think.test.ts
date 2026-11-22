import { describe, expect, it } from 'vitest'
import { THINK_PREFILL, prependThinkPrefill, withThinkPrefill } from './think'

describe('withThinkPrefill', () => {
  it('会話の末尾に <think> の書き出しを持つ assistant メッセージを足す(元の配列は変えない)', () => {
    const messages = [{ role: 'user', content: 'こんにちは' }]
    const out = withThinkPrefill(messages)
    expect(out).toEqual([{ role: 'user', content: 'こんにちは' }, { role: 'assistant', content: '<think>\n' }])
    expect(messages).toHaveLength(1)
  })
})

describe('prependThinkPrefill', () => {
  it('ストリームの先頭に <think> の content イベントを足し、元の内容はそのまま流す', async () => {
    const src = 'data: {"choices":[{"delta":{"content":"考え"}}]}\n\n'
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(src))
        c.close()
      },
    })
    const text = await new Response(prependThinkPrefill(stream)).text()
    const prefillEvent = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: THINK_PREFILL } }] })}\n\n`
    expect(text).toBe(prefillEvent + src)
  })
})
