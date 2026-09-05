// RAGインデックスの状態を返す。チャット画面が起動時に叩き、RAGトグルの
// 有効/無効判定に使う。getIndexStatus() が内部で ensureIndex() を await するため、
// このAPIを叩くこと自体が「受講者が最初の質問をする前にインデックスを構築しておく」
// ウォームアップの役割も兼ねる。

import { getIndexStatus } from '@/lib/rag/indexer'

export async function GET() {
  const status = await getIndexStatus()
  return Response.json(status)
}
