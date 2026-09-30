// /presenter の「RAGソース」タブ向けに、RAGインデックスの詳細な状態
// (ファイル数・チャンク数・次元数・最終構築時刻・直近のエラー)を返す。
// 講師のみ利用できる(lib/presenter/auth.ts の requirePresenter)。

import { getIndexStatus } from '@/lib/rag/indexer'
import { requirePresenter } from '@/lib/presenter/auth'

export async function GET(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  return Response.json(await getIndexStatus())
}
