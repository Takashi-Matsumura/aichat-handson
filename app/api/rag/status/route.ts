// RAGの利用可否を返す。チャット画面が起動時に叩き、RAGトグルの有効/無効判定に使う。
// getIndexStatus() が内部で ensureIndex() を await するため、このAPIを叩くこと自体が
// 「受講者が最初の質問をする前にインデックスを構築しておく」ウォームアップの役割も兼ねる。
//
// 認証なしで受講者も叩くため、判定に必要な2項目だけを返す。エラー内容や構築時刻などの
// 詳細は講師用の /api/admin/rag-status から取得する。

import { getIndexStatus } from '@/lib/rag/indexer'

export async function GET() {
  const { online, chunkCount } = await getIndexStatus()
  return Response.json({ online, chunkCount })
}
