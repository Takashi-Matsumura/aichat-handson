// /presenter からRAGインデックスを即座に再構築するためのAPI。
// 講師のみ利用できる(lib/presenter/auth.ts の requirePresenter)。

import { rebuildIndex } from '@/lib/rag/indexer'
import { requirePresenter } from '@/lib/presenter/auth'

export async function POST(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const index = await rebuildIndex()
  return Response.json({
    fileCount: index.fileCount,
    chunkCount: index.chunks.length,
    builtAt: index.builtAt,
    dims: index.dims,
    error: index.error,
  })
}
