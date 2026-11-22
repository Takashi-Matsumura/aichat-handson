import { describe, expect, it } from 'vitest'
import { createReasoningRewriter, rewriteReasoningStream } from './reasoning'

const line = (delta: Record<string, unknown>) => `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}`
const contentOf = (l: string) => JSON.parse(l.slice(6)).choices[0].delta.content

describe('createReasoningRewriter', () => {
  it('思考を <think> で開き、最初の本文の前で閉じる', () => {
    const { rewriteLine } = createReasoningRewriter()
    expect(contentOf(rewriteLine(line({ reasoning_content: 'A' })))).toBe('<think>\nA')
    expect(contentOf(rewriteLine(line({ reasoning_content: 'B' })))).toBe('B')
    expect(contentOf(rewriteLine(line({ content: '答え' })))).toBe('\n</think>\n\n答え')
    expect(contentOf(rewriteLine(line({ content: '続き' })))).toBe('続き')
  })

  it('reasoning_content を delta から取り除く', () => {
    const { rewriteLine } = createReasoningRewriter()
    const out = JSON.parse(rewriteLine(line({ reasoning_content: 'A', role: 'assistant' })).slice(6))
    expect(out.choices[0].delta).toEqual({ role: 'assistant', content: '<think>\nA' })
  })

  it('思考が無ければ本文はそのまま', () => {
    const { rewriteLine } = createReasoningRewriter()
    const l = line({ content: 'こんにちは' })
    expect(rewriteLine(l)).toBe(l)
  })

  it('data行以外・不正なJSON・usageだけの行はそのまま', () => {
    const { rewriteLine } = createReasoningRewriter()
    for (const l of ['', ': ping', 'data: {broken', 'data: {"usage":{"prompt_tokens":1}}']) {
      expect(rewriteLine(l)).toBe(l)
    }
  })

  it('思考だけで終わったら [DONE] の前に閉じタグを入れる', () => {
    const { rewriteLine } = createReasoningRewriter()
    rewriteLine(line({ reasoning_content: 'A' }))
    const out = rewriteLine('data: [DONE]').split('\n\n')
    expect(contentOf(out[0])).toBe('\n</think>')
    expect(out[1]).toBe('data: [DONE]')
  })
})

describe('rewriteReasoningStream', () => {
  it('チャンク境界をまたぐ行も正しく書き換える', async () => {
    const src = [line({ reasoning_content: '考え' }), '', line({ content: '答え' }), '', 'data: [DONE]', '', ''].join('\n')
    const enc = new TextEncoder()
    const bytes = enc.encode(src)
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        // 3バイトずつに分割(マルチバイト文字の途中でも切れる)
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3))
        c.close()
      },
    })
    const text = await new Response(rewriteReasoningStream(stream)).text()
    const contents = text.split('\n').filter(l => l.startsWith('data: {')).map(contentOf)
    expect(contents.join('')).toBe('<think>\n考え\n</think>\n\n答え')
    expect(text).toContain('data: [DONE]')
  })
})
