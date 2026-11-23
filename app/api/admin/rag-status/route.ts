// /presenter の「RAGソース」タブ向けに、RAGインデックスの詳細な状態
// (ファイル数・チャンク数・次元数・最終構築時刻・直近のエラー)を返す。
// 講師のみ利用できる(lib/presenter/auth.ts の requirePresenter)。

// あわせて、資料の合計文字数と、AIに渡す文書の上限(lib/rag/context.ts)も返す。

import { RAG_CONFIG } from '@/lib/rag/config'
import { loadDocuments } from '@/lib/rag/documents'
import { getIndexStatus } from '@/lib/rag/indexer'
import { requirePresenter } from '@/lib/presenter/auth'

export async function GET(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const status = await getIndexStatus()
  const totalChars = await loadDocuments()
    .then(docs => docs.reduce((sum, d) => sum + d.content.length, 0))
    .catch(() => 0)
  return Response.json({
    ...status,
    totalChars,
    docContextChars: RAG_CONFIG.docContextChars,
    docMaxCount: RAG_CONFIG.docMaxCount,
    queryCount: RAG_CONFIG.queryCount,
  })
}
