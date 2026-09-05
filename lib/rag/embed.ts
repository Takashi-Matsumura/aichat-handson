// 埋め込み専用のllama-server(RAG_CONFIG.embedUrl)への問い合わせ。
// classify.ts と同じく、素の fetch で OpenAI互換エンドポイントを叩く(新規依存なし)。
//
// この中の関数は例外を投げる(throw)。呼び出し側は indexer.ts / search.ts の2箇所のみで、
// そこで必ず catch してチャット機能に影響を波及させない(RAGが使えないだけにする)。

import { RAG_CONFIG } from './config'

type EmbeddingsResponse = {
  data?: { embedding: number[] | number[][]; index?: number }[]
}

// バッチ内の順序を保ったまま埋め込みベクトルを取得する。
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += RAG_CONFIG.embedBatchSize) {
    const batch = texts.slice(i, i + RAG_CONFIG.embedBatchSize)
    const vectors = await requestEmbeddings(batch)
    results.push(...vectors)
  }
  return results
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await requestEmbeddings([`${RAG_CONFIG.queryPrefix}${text}`])
  return vector
}

// 埋め込みサーバの疎通確認。例外を投げず boolean を返す(UIのトグル有効/無効判定用)。
export async function isEmbedServerOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${RAG_CONFIG.embedUrl}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function requestEmbeddings(inputs: string[]): Promise<number[][]> {
  let res: Response
  try {
    res = await fetch(`${RAG_CONFIG.embedUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RAG_CONFIG.embedModel, input: inputs }),
      signal: AbortSignal.timeout(RAG_CONFIG.embedTimeoutMs),
    })
  } catch (err) {
    throw new Error(`埋め込みサーバーに接続できませんでした: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) {
    throw new Error(`埋め込みリクエストが失敗しました (status ${res.status})`)
  }
  const data = (await res.json()) as EmbeddingsResponse
  if (!data.data || data.data.length === 0) {
    throw new Error('埋め込み応答が空でした')
  }
  // index が付与されている場合は順序保証を仕様に頼らずソートし直す。
  const sorted = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  return sorted.map(item => l2normalize(toFlatVector(item.embedding)))
}

// --pooling none で起動されたサーバーは embedding が number[][](トークンごと)で返る。
// その場合は平均プーリングして number[] に潰す。
function toFlatVector(embedding: number[] | number[][]): number[] {
  if (embedding.length === 0) return []
  if (!Array.isArray(embedding[0])) return embedding as number[]
  const rows = embedding as number[][]
  const dims = rows[0].length
  const mean = new Array(dims).fill(0)
  for (const row of rows) {
    for (let d = 0; d < dims; d++) mean[d] += row[d]
  }
  return mean.map(v => v / rows.length)
}

function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  if (norm === 0) return v
  return v.map(x => x / norm)
}
