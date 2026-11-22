// Web検索の利用可否を返す。チャット画面が起動時に叩き、Web検索トグルの有効/無効判定に使う。
// 認証なしで受講者も叩くため、判定に必要な1項目だけを返す(SearXNG のURL等は返さない)。

import { checkWebSearchOnline } from '@/lib/web/search'

export async function GET() {
  return Response.json({ online: await checkWebSearchOnline() })
}
