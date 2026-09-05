'use client'

import Link from 'next/link'
import { startTransition, useEffect, useState } from 'react'
import { loadPersonalStats, type PersonalStats } from '@/lib/personal-stats'
import { MODEL_PRICING, USD_TO_JPY_RATE, formatJPY } from '@/lib/analytics/pricing'
import { StatTile } from '@/app/components/dashboard/StatTile'
import { CostFlipTile } from '@/app/components/dashboard/CostFlipTile'

const MODEL_PRICE_ENTRIES = Object.entries(MODEL_PRICING).map(([model, p]) => ({ model, ...p }))

function averageLatencyMs(stats: { latencySumMs: number; latencyCount: number }): number | null {
  return stats.latencyCount > 0 ? Math.round(stats.latencySumMs / stats.latencyCount) : null
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<PersonalStats | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    startTransition(() => {
      setStats(loadPersonalStats())
      setLoaded(true)
    })
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex items-start gap-3">
          <Link
            href="/"
            title="チャット画面に戻る"
            aria-label="チャット画面に戻る"
            className="mt-0.5 shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold">AI利用状況（あなたの利用分）</h1>
            <p className="mt-1 text-xs text-foreground/50">
              この画面はこのブラウザに記録された分だけを集計しています（サーバーには保存されません）。会場全体の統計ではありません。
            </p>
          </div>
        </div>

        {!loaded ? (
          <span className="text-sm text-foreground/40 animate-pulse">読み込み中...</span>
        ) : !stats || stats.requestCount === 0 ? (
          <p className="rounded-xl border border-black/10 p-6 text-sm text-foreground/60 dark:border-white/15">
            まだチャットの利用履歴がありません。チャット画面で質問を送ると、ここに利用状況が表示されます。
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatTile label="質問した回数" value={stats.requestCount.toLocaleString('ja-JP')} />
              <StatTile label="入力トークン" value={stats.inputTokens.toLocaleString('ja-JP')} />
              <StatTile label="出力トークン" value={stats.outputTokens.toLocaleString('ja-JP')} />
              <CostFlipTile
                label="推定コスト（クラウドAI換算）"
                value={formatJPY(stats.estimatedCost)}
                hint="実際の課金はありません。同規模モデルをクラウドAPIで使った場合の参考値です"
                exchangeRate={USD_TO_JPY_RATE}
                prices={MODEL_PRICE_ENTRIES}
              />
              <StatTile
                label="平均レスポンス時間"
                value={(() => {
                  const ms = averageLatencyMs(stats)
                  return ms != null ? `${(ms / 1000).toFixed(1)}秒` : '-'
                })()}
              />
            </div>

            {Object.keys(stats.models).length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">モデル別のコスト・速度比較</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(stats.models).map(([model, m]) => (
                    <div key={model} className="rounded-xl border border-black/10 p-4 dark:border-white/15">
                      <p className="text-sm font-semibold">{model}</p>
                      <p className="mt-1 text-xs text-foreground/50">利用件数 {m.requestCount.toLocaleString('ja-JP')}件</p>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-foreground/60">1件あたりコスト</p>
                          <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {formatJPY(m.estimatedCost / m.requestCount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-foreground/60">平均レスポンス時間</p>
                          <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {(() => {
                              const ms = averageLatencyMs(m)
                              return ms != null ? `${(ms / 1000).toFixed(1)}秒` : '-'
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <p className="text-xs text-foreground/40">
          トークンはAIとのやり取りの課金単位で、文章の長さに応じて増減します。推定コストは、同規模のモデルをクラウドAPI経由で使った場合の参考換算値です（このアプリはローカル実行のため実際の課金はありません）。
        </p>
      </div>
    </div>
  )
}
