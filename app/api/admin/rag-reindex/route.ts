// /presenter からRAGインデックスを即座に再構築するためのAPI。
// admin/model-lock と同様に認証は行わない(このアプリ全体がログイン無しの方針のため)。
// 無認証で誰でも叩けるが、実害は再構築1回分の負荷のみなので許容する。

import { rebuildIndex } from '@/lib/rag/indexer'

export async function POST() {
  const index = await rebuildIndex()
  return Response.json({
    fileCount: index.fileCount,
    chunkCount: index.chunks.length,
    builtAt: index.builtAt,
    dims: index.dims,
    error: index.error,
  })
}
