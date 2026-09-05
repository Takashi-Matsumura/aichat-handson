'use client'

import { useEffect, useState } from 'react'
import { CLASSIFICATION_DIMENSION_COLUMNS } from '@/lib/analytics/types'
import type { Summary, ModelStat } from '@/lib/analytics/types'
import { MODEL_PRICING, USD_TO_JPY_RATE, formatJPY } from '@/lib/analytics/pricing'
import { StatTile } from './StatTile'
import { BarChart } from './BarChart'
import { TrendChart } from './TrendChart'
import { ModelStatsTable } from './ModelStatsTable'
import { CostFlipTile } from './CostFlipTile'

const MODEL_PRICE_ENTRIES = Object.entries(MODEL_PRICING).map(([model, p]) => ({ model, ...p }))

type AnalyticsResponse = {
  from: string
  to: string
  summary: Summary
  categories: Record<string, { value: string; count: number }[]>
  models: ModelStat[]
}

const DIMENSION_LABELS: Record<string, string> = {
  business_category: '業務カテゴリ',
  usage_purpose: '利用目的',
  task_type: 'タスク種別',
  improvement_type: '改善視点',
  automation_potential: '自動化可能性',
  sensitivity_level: '機密度',
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

const cardClass =
  'w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 shadow-sm flex flex-col gap-2'

export function AdminStatsPanel() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const res = await fetch('/api/admin/analytics')
        if (!res.ok) throw new Error('取得に失敗しました')
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setError('利用統計の取得に失敗しました')
      }
    }
    fetchData()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>
  }

  if (!data) {
    return <span className="text-gray-300 dark:text-zinc-600 text-sm animate-pulse">取得中...</span>
  }

  const { summary, categories, models } = data

  return (
    <div className="w-full flex flex-col gap-6">
      <p className="text-xs text-gray-400 dark:text-zinc-500">
        期間: {formatDate(data.from)} 〜 {formatDate(data.to)} ・ ログインは無く、接続セッション単位で匿名集計しています
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="利用件数" value={summary.requestCount.toLocaleString('ja-JP')} />
        <StatTile label="アクティブ利用セッション数" value={summary.activeUserCount.toLocaleString('ja-JP')} />
        <StatTile label="入力トークン" value={summary.inputTokens.toLocaleString('ja-JP')} />
        <StatTile label="出力トークン" value={summary.outputTokens.toLocaleString('ja-JP')} />
        <CostFlipTile
          label="推定コスト（クラウドAI換算）"
          value={formatJPY(summary.estimatedCost)}
          hint="実際の課金はありません。同規模モデルをクラウドAPIで使った場合の参考値です"
          exchangeRate={USD_TO_JPY_RATE}
          prices={MODEL_PRICE_ENTRIES}
        />
        <StatTile
          label="平均レスポンス時間"
          value={summary.averageLatencyMs != null ? `${(summary.averageLatencyMs / 1000).toFixed(1)}秒` : '-'}
        />
        <StatTile label="エラー率" value={`${(summary.errorRate * 100).toFixed(1)}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cardClass}>
          <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-zinc-100">日別利用件数</h3>
          <TrendChart data={summary.dailyCounts.map((d) => ({ label: d.date, value: d.count }))} />
        </section>
        <section className={cardClass}>
          <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-zinc-100">月別利用件数</h3>
          <BarChart items={summary.monthlyCounts.map((m) => ({ label: m.month, value: m.count }))} />
        </section>
      </div>

      <section className={cardClass}>
        <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-zinc-100">モデル別利用状況</h3>
        <BarChart items={models.map((m) => ({ label: `${m.provider}/${m.model}`, value: m.requestCount }))} />
        <div className="mt-2">
          <ModelStatsTable models={models} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-zinc-100">カテゴリ別分析</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {CLASSIFICATION_DIMENSION_COLUMNS.map((dimension) => (
            <div key={dimension} className={cardClass}>
              <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-zinc-100">{DIMENSION_LABELS[dimension]}</h3>
              <BarChart items={(categories[dimension] ?? []).map((c) => ({ label: c.value, value: c.count }))} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
