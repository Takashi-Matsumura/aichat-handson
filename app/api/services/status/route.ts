// 周辺サービス(SearXNG・VOICEVOX)の稼働状況を返す。/analytics が表示に使う。
// 認証なしで受講者も叩くため、状態だけを返す(URL等の構成情報は返さない)。

import { getServiceStatuses } from '@/lib/services/status'

export async function GET() {
  return Response.json({ services: await getServiceStatuses() })
}
