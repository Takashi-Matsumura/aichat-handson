// コサイン類似度によるインメモリ総当たり検索。
//
// 外部ベクトルDBは使わない。研修のデモ規模(知識ソース数十〜数百チャンク)であれば、
// 配列を毎回舐めるだけで十分高速。ベクトルは格納時にL2正規化済みなので、
// コサイン類似度の計算は単純な内積に落ちる。

import { RAG_CONFIG } from './config'
import { embedQuery } from './embed'
import { ensureIndex } from './indexer'
import type { Chunk } from './store'

export type Hit = { chunk: Chunk; score: number }

export function cosineSimilarity(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

// 検索の入口。埋め込みサーバ不通・インデックス空・例外のいずれでも throw せず、
// 空配列＋エラーメッセージを返す(chat route を絶対に壊さないため)。
export async function retrieve(query: string): Promise<{ hits: Hit[]; error: string | null }> {
  try {
    const index = await ensureIndex()
    if (index.chunks.length === 0) {
      return { hits: [], error: index.error }
    }
    const queryVector = await embedQuery(query)
    const scored = index.chunks
      .map(chunk => ({ chunk, score: cosineSimilarity(queryVector, chunk.vector) }))
      .filter(hit => hit.score >= RAG_CONFIG.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, RAG_CONFIG.topK)
    return { hits: scored, error: null }
  } catch (err) {
    return { hits: [], error: err instanceof Error ? err.message : String(err) }
  }
}
