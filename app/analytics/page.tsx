import Link from 'next/link'
import {
  getSummary,
  getCategoryBreakdown,
  getModelStats,
  getRagCandidates,
  getAutomationCandidates,
  CLASSIFICATION_DIMENSION_COLUMNS,
} from '@/lib/analytics/analytics'
import { resolveDateRange, toURLSearchParams } from '@/lib/analytics/analytics-query'
import { StatTile } from '@/app/components/dashboard/StatTile'
import { BarChart } from '@/app/components/dashboard/BarChart'
import { TrendChart } from '@/app/components/dashboard/TrendChart'
import { CandidateList } from '@/app/components/dashboard/CandidateList'

// インメモリストアの最新状態を都度反映するため、キャッシュせず常に動的にレンダリングする。
export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const DIMENSION_LABELS: Record<string, string> = {
  business_category: '業務カテゴリ',
  usage_purpose: '利用目的',
  task_type: 'タスク種別',
  improvement_type: '改善視点',
  automation_potential: '自動化可能性',
  sensitivity_level: '機密度',
}

// 候補一覧はページングUIを持たず、直近N件のみ表示する(ハンズオン用の簡易表示)。
const CANDIDATE_PAGE_SIZE = 10

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const range = resolveDateRange(toURLSearchParams(await searchParams))

  const [summary, categories, models, ragCandidates, automationCandidates] = await Promise.all([
    getSummary(range),
    getCategoryBreakdown(range),
    getModelStats(range),
    getRagCandidates(range, 1, CANDIDATE_PAGE_SIZE),
    getAutomationCandidates(range, 1, CANDIDATE_PAGE_SIZE),
  ])

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">AI利用状況ダッシュボード</h1>
            <p className="mt-1 text-xs text-foreground/50">
              期間: {formatDate(range.from)} 〜 {formatDate(range.to)} ・ ログインは無く、接続セッション単位で匿名集計しています
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 flex items-center gap-1.5 text-sm text-foreground/50 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            チャット画面に戻る
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile label="利用件数" value={summary.requestCount.toLocaleString('ja-JP')} />
          <StatTile label="アクティブ利用セッション数" value={summary.activeUserCount.toLocaleString('ja-JP')} />
          <StatTile label="入力トークン" value={summary.inputTokens.toLocaleString('ja-JP')} />
          <StatTile label="出力トークン" value={summary.outputTokens.toLocaleString('ja-JP')} />
          <StatTile
            label="推定コスト"
            value={`$${summary.estimatedCost.toFixed(2)}`}
            hint="ローカル実行のため実費はかかりません"
          />
          <StatTile
            label="平均レスポンス時間"
            value={summary.averageLatencyMs != null ? `${(summary.averageLatencyMs / 1000).toFixed(1)}秒` : '-'}
          />
          <StatTile label="エラー率" value={`${(summary.errorRate * 100).toFixed(1)}%`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-black/10 p-4 dark:border-white/15">
            <h3 className="mb-3 text-sm font-semibold">日別利用件数</h3>
            <TrendChart data={summary.dailyCounts.map((d) => ({ label: d.date, value: d.count }))} />
          </section>
          <section className="rounded-xl border border-black/10 p-4 dark:border-white/15">
            <h3 className="mb-3 text-sm font-semibold">月別利用件数</h3>
            <BarChart items={summary.monthlyCounts.map((m) => ({ label: m.month, value: m.count }))} />
          </section>
        </div>

        <section className="rounded-xl border border-black/10 p-4 dark:border-white/15">
          <h3 className="mb-3 text-sm font-semibold">モデル別利用状況</h3>
          <BarChart items={models.map((m) => ({ label: `${m.provider}/${m.model}`, value: m.requestCount }))} />
          {models.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-xs text-foreground/50 dark:border-white/15">
                    <th className="py-2 pr-4">プロバイダー</th>
                    <th className="py-2 pr-4">モデル</th>
                    <th className="py-2 pr-4 text-right">利用件数</th>
                    <th className="py-2 pr-4 text-right">入力トークン</th>
                    <th className="py-2 pr-4 text-right">出力トークン</th>
                    <th className="py-2 pr-4 text-right">平均レスポンス</th>
                    <th className="py-2 pr-4 text-right">エラー件数</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={`${m.provider}:${m.model}`} className="border-b border-black/5 dark:border-white/10">
                      <td className="py-2 pr-4">{m.provider}</td>
                      <td className="py-2 pr-4">{m.model}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{m.requestCount.toLocaleString('ja-JP')}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{m.inputTokens.toLocaleString('ja-JP')}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{m.outputTokens.toLocaleString('ja-JP')}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {m.averageLatencyMs != null ? `${(m.averageLatencyMs / 1000).toFixed(1)}秒` : '-'}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{m.errorCount.toLocaleString('ja-JP')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">カテゴリ別分析</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {CLASSIFICATION_DIMENSION_COLUMNS.map((dimension) => (
              <div key={dimension} className="rounded-xl border border-black/10 p-4 dark:border-white/15">
                <h3 className="mb-3 text-sm font-semibold">{DIMENSION_LABELS[dimension]}</h3>
                <BarChart items={(categories[dimension] ?? []).map((c) => ({ label: c.value, value: c.count }))} />
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="mb-1 text-lg font-semibold">RAG候補</h2>
            <p className="mb-3 text-xs text-foreground/50">
              社内ドキュメント整備によって回答品質が上がりそうな質問（該当 {ragCandidates.total} 件）
            </p>
            <CandidateList items={ragCandidates.items} />
          </section>
          <section>
            <h2 className="mb-1 text-lg font-semibold">自動化候補</h2>
            <p className="mb-3 text-xs text-foreground/50">
              自動化可能性が「高」と判定された質問（該当 {automationCandidates.total} 件）
            </p>
            <CandidateList items={automationCandidates.items} />
          </section>
        </div>
      </div>
    </div>
  )
}
