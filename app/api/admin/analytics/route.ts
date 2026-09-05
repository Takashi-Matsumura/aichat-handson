// /presenter の「利用統計」タブから会場全体のAI利用状況を取得するためのAPI。
// admin/model-lock 等と同様に認証は行わない(このアプリ全体がログイン無しの方針のため)。
// /presenter が client component のため、Server Component から直接呼んでいる
// lib/analytics/analytics.ts の集計をこのルート経由で返す。

import { getSummary, getCategoryBreakdown, getModelStats } from '@/lib/analytics/analytics'
import { resolveDateRange, toURLSearchParams } from '@/lib/analytics/analytics-query'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  let range
  try {
    range = resolveDateRange(toURLSearchParams(Object.fromEntries(searchParams)))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : '日付範囲が不正です' }, { status: 400 })
  }

  const [summary, categories, models] = await Promise.all([
    getSummary(range),
    getCategoryBreakdown(range),
    getModelStats(range),
  ])

  return Response.json({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    summary,
    categories,
    models,
  })
}
