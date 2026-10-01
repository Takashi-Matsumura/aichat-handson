import { describe, expect, it } from 'vitest'
import { createArrayItemExtractor, parseJsonLoose } from './json'

// 文字列を n 文字ずつに分けて流し込み、取り出された要素をすべて返す。
function feed(text: string, n: number): string[] {
  const extract = createArrayItemExtractor()
  const items: string[] = []
  for (let i = 0; i < text.length; i += n) items.push(...extract(text.slice(i, i + n)))
  return items
}

describe('createArrayItemExtractor', () => {
  const text = '```json\n{"questions": [{"q": "a{b}[c]", "c": ["x", "y"]}, {"q": "say \\"}\\" ok"}]}\n```'

  it.each([1, 3, 7, 1000])('%i文字ずつ届いても、閉じた要素を順に取り出す', (n) => {
    const items = feed(text, n)
    expect(items.map((s) => JSON.parse(s))).toEqual([{ q: 'a{b}[c]', c: ['x', 'y'] }, { q: 'say "}" ok' }])
  })

  it('閉じる前の要素は返さない', () => {
    const extract = createArrayItemExtractor()
    expect(extract('{"questions":[{"q":"a"},{"q":"b"')).toEqual(['{"q":"a"}'])
    expect(extract('}]}')).toEqual(['{"q":"b"}'])
  })

  it('配列だけの出力にも対応する', () => {
    expect(feed('[{"a":1},{"a":2}]', 2)).toEqual(['{"a":1}', '{"a":2}'])
  })

  it('入れ子の配列内のオブジェクトは要素として扱わない', () => {
    expect(feed('{"questions":[{"c":[{"x":1}]}]}', 4)).toEqual(['{"c":[{"x":1}]}'])
  })
})

describe('parseJsonLoose', () => {
  it('コードフェンス付きでも解析する', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
})
