import { describe, expect, it } from 'vitest'
import { docTitle, packDocuments, rankDocuments } from './documents'
import { buildDocumentBlock, toDocSourceRefs } from './prompt'
import type { Hit } from './search'

const hit = (file: string, title: string, text: string, score: number): Hit => ({
  chunk: { id: `${file}#${title}`, file, title, text, vector: [] },
  score,
})

describe('docTitle', () => {
  it('最初の見出しを題名にする。無ければファイル名', () => {
    expect(docTitle('> 注記\n\n# 休暇規程\n\n## 申請方法', 'a.md')).toBe('休暇規程')
    expect(docTitle('本文だけ', 'memo.txt')).toBe('memo.txt')
  })
})

describe('rankDocuments', () => {
  it('文書ごとにまとめ、一番近いチャンクの類似度で並べる', () => {
    const ranked = rankDocuments([
      hit('休暇.md', '特別休暇', 'a', 0.7),
      hit('経費.md', '出張', 'b', 0.6),
      hit('休暇.md', '申請方法', 'c', 0.65),
      hit('規則.md', '時間外', 'd', 0.75),
    ])
    expect(ranked.map(r => [r.file, r.score, r.hits.length])).toEqual([
      ['規則.md', 0.75, 1],
      ['休暇.md', 0.7, 2],
      ['経費.md', 0.6, 1],
    ])
  })
})

describe('packDocuments', () => {
  const docs = [
    { file: 'a.md', title: 'A', content: 'x'.repeat(100) },
    { file: 'b.md', title: 'B', content: 'y'.repeat(300) },
    { file: 'c.md', title: 'C', content: 'z'.repeat(50) },
  ]
  const ranked = rankDocuments([
    hit('a.md', 'A1', 'aa', 0.8),
    hit('b.md', 'B1', 'b'.repeat(20), 0.7),
    hit('c.md', 'C1', 'cc', 0.6),
  ])

  it('上位から全文を上限まで詰め、入りきらない文書は当たったチャンクだけにする', () => {
    const packed = packDocuments(ranked, docs, 200, 3)
    expect(packed.map(p => [p.file, p.kind])).toEqual([
      ['a.md', 'whole'],
      ['b.md', 'chunks'],
      ['c.md', 'whole'],
    ])
    expect(packed[1].text).toBe(`## B1\n${'b'.repeat(20)}`)
  })

  it('文書数の上限で打ち切る', () => {
    expect(packDocuments(ranked, docs, 10_000, 2).map(p => p.file)).toEqual(['a.md', 'b.md'])
  })

  it('プロンプトと出典に、全文か一部かを示す', () => {
    const packed = packDocuments(ranked, docs, 200, 3)
    const block = buildDocumentBlock(packed)
    expect(block).toContain('[資料1: a.md]')
    expect(block).toContain('[資料2: b.md（関係する部分のみ）]')
    expect(block).toContain('在宅勤務＝リモートワーク')
    const refs = toDocSourceRefs(packed)
    expect(refs.map(r => [r.title, r.whole, r.score])).toEqual([
      ['A', true, 0.8],
      ['B（一部）', false, 0.7],
      ['C', true, 0.6],
    ])
  })
})
