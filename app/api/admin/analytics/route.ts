// /presenter の「利用統計」タブから会場全体のAI利用状況を取得するためのAPI。
// admin/model-lock 等と同様に認証は行わない(このアプリ全体がログイン無しの方針のため)。
// /presenter が client component のため、Server Component から直接呼んでいる
// lib/analytics/analytics.ts の集計をこのルート経由で返す。

import {
  getSummary,
  getCategoryBreakdown,
  getModelStats,
  getRagCandidates,
  getAutomationCandidates,
} from '@/lib/analytics/analytics'
import { resolveDateRange, toURLSearchParams } from '@/lib/analytics/analytics-query'

export const dynamic = 'force-dynamic'

// 候補一覧はページングUIを持たず、直近N件のみ返す(ハンズオン用の簡易表示)。
const CANDIDATE_PAGE_SIZE = 10

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  let range
  try {
    range = resolveDateRange(toURLSearchParams(Object.fromEntries(searchParams)))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : '日付範囲が不正です' }, { status: 400 })
  }

  const [summary, categories, models, ragCandidates, automationCandidates] = await Promise.all([
    getSummary(range),
    getCategoryBreakdown(range),
    getModelStats(range),
    getRagCandidates(range, 1, CANDIDATE_PAGE_SIZE),
    getAutomationCandidates(range, 1, CANDIDATE_PAGE_SIZE),
  ])

  return Response.json({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    summary,
    categories,
    models,
    ragCandidates,
    automationCandidates,
  })
}
