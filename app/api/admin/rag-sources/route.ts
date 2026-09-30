// /presenter の「RAGソース」タブから、知識ソースファイルの一覧取得・新規作成・上書き保存・削除を行う。
// 講師のみ利用できる(lib/presenter/auth.ts の requirePresenter)。

import { deleteSourceContent, listSourceContents, saveSourceContent } from '@/lib/rag/sources'
import { rebuildIndex } from '@/lib/rag/indexer'
import { requirePresenter } from '@/lib/presenter/auth'

// 変更操作(POST/DELETE)後に反映結果が見えるよう、その場で再構築してから状態を返す。
async function rebuiltStatus() {
  const index = await rebuildIndex()
  return {
    fileCount: index.fileCount,
    chunkCount: index.chunks.length,
    builtAt: index.builtAt,
    dims: index.dims,
    error: index.error,
  }
}

export async function GET(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const sources = await listSourceContents()
  return Response.json({ sources })
}

export async function POST(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const { relPath, content } = await request.json()
  if (typeof relPath !== 'string' || typeof content !== 'string') {
    return Response.json({ error: 'relPathとcontentが必要です' }, { status: 400 })
  }
  const result = await saveSourceContent(relPath, content)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }
  return Response.json({ ok: true, status: await rebuiltStatus() })
}

export async function DELETE(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const { relPath } = await request.json()
  if (typeof relPath !== 'string') {
    return Response.json({ error: 'relPathが必要です' }, { status: 400 })
  }
  const result = await deleteSourceContent(relPath)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }
  return Response.json({ ok: true, status: await rebuiltStatus() })
}
