// RAGインデックスのインメモリストア。
//
// lib/analytics/store.ts, lib/settings/store.ts と同じ方針: DBを持たないため
// Next.js サーバープロセスのメモリ内に保持するだけにする(サーバー再起動で消えてよい。
// 次のリクエストで自動的に再構築される)。dev の HMR でモジュールが再評価されても
// データが消えないよう、globalThis に固定して保持する。

export type Chunk = {
  id: string        // `${relPath}#${ordinal}`
  file: string       // knowledgeDir からの相対パス
  title: string      // 見出しパンくず、無ければファイル名
  text: string        // 本文(埋め込み用プレフィックスは含まない)
  vector: number[]    // L2正規化済み
}

export type RagIndex = {
  chunks: Chunk[]
  fileCount: number
  // ファイル一覧(パス・mtime・サイズ)から作る署名。これが変わったら再構築が必要。
  signature: string
  builtAt: Date | null
  dims: number | null
  // 直近のビルド失敗理由。失敗しても既存インデックスは保持したままここにだけ記録する。
  error: string | null
}

type Store = {
  index: RagIndex
  // 構築中のPromiseを保持し、同時に来た複数リクエストが二重にビルドしないようにする。
  building: Promise<RagIndex> | null
}

function emptyIndex(): RagIndex {
  return { chunks: [], fileCount: 0, signature: '', builtAt: null, dims: null, error: null }
}

const globalForRag = globalThis as unknown as { __ragStore?: Store }

export const ragStore: Store =
  globalForRag.__ragStore ?? (globalForRag.__ragStore = { index: emptyIndex(), building: null })

export function getIndex(): RagIndex {
  return ragStore.index
}

export function setIndex(index: RagIndex): void {
  ragStore.index = index
}
