import { describe, expect, it } from 'vitest'
import { mergeHits } from './search'
import type { Chunk } from './store'

const chunk = (id: string, vector: number[]): Chunk => ({ id, file: `${id}.md`, title: id, text: id, vector })

describe('mergeHits', () => {
  const chunks = [chunk('remote', [1, 0, 0]), chunk('birthday', [0, 1, 0]), chunk('other', [0, 0, 1])]

  it('チャンクごとに、いちばん近い検索文の類似度を採る', () => {
    // 1つめの検索文は remote に、2つめは birthday に近い
    const hits = mergeHits(chunks, [[0.9, 0.1, 0], [0.1, 0.8, 0]], 0.3, 4)
    expect(hits.map(h => [h.chunk.id, h.score])).toEqual([
      ['remote', 0.9],
      ['birthday', 0.8],
    ])
  })

  it('下限未満は除き、上位 topK 件に絞る', () => {
    const hits = mergeHits(chunks, [[0.9, 0.8, 0.2]], 0.3, 1)
    expect(hits.map(h => h.chunk.id)).toEqual(['remote'])
  })
})
