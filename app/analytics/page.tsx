'use client'

import Link from 'next/link'
import { startTransition, useEffect, useState } from 'react'
import { loadPersonalStats, type PersonalStats } from '@/lib/personal-stats'
import { ANALYTICS_MODEL_NAMES } from '@/lib/llama/models'
import type { ServiceState, ServiceStatus } from '@/lib/services/status'
import { MODEL_PRICING, USD_TO_JPY_RATE, formatJPY } from '@/lib/analytics/pricing'
import { StatTile } from '@/app/components/dashboard/StatTile'
import { CostFlipTile } from '@/app/components/dashboard/CostFlipTile'

const MODEL_PRICE_ENTRIES = Object.entries(MODEL_PRICING).map(([model, p]) => ({ model, ...p }))

function averageLatencyMs(stats: { latencySumMs: number; latencyCount: number }): number | null {
  return stats.latencyCount > 0 ? Math.round(stats.latencySumMs / stats.latencyCount) : null
}

// 出力トークン合計 ÷ 応答時間合計。応答時間には最初の1文字が出るまでの待ち時間も含むため、
// 純粋な生成速度よりやや低めに出る「体感の生成速度」。
function tokensPerSecond(stats: { outputTokens: number; latencySumMs: number }): number | null {
  return stats.latencySumMs > 0 ? stats.outputTokens / (stats.latencySumMs / 1000) : null
}

// モデル別の比較では、利用実績の有無にかかわらずモデル1・2を常に表示する。
const FIXED_MODELS = ([1, 2] as const).map((index) => ({ index, name: ANALYTICS_MODEL_NAMES[index] }))

// モデルの稼働状況。checking = 確認中、locked = 講師(/presenter)が一時停止中。
type ModelState = 'checking' | 'online' | 'offline' | 'locked'

// 稼働状況を取り直す間隔。サーバーを起動・停止したときに、開いたままの画面にも反映させる。
const STATUS_POLL_MS = 15_000

async function fetchModelOnline(n: 1 | 2): Promise<boolean> {
  try {
    const res = await fetch(`/api/model-info?n=${n}`, { cache: 'no-store' })
    const data = await res.json()
    return data.model != null
  } catch {
    return false
  }
}

async function fetchModel1Enabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/model-lock', { cache: 'no-store' })
    const data = await res.json()
    return data.model1Enabled !== false
  } catch {
    return true
  }
}

async function fetchServices(): Promise<ServiceStatus[] | null> {
  try {
    const res = await fetch('/api/services/status', { cache: 'no-store' })
    const data = await res.json()
    return Array.isArray(data.services) ? data.services : null
  } catch {
    return null
  }
}

function useSystemStatus() {
  const [models, setModels] = useState<Record<1 | 2, ModelState>>({ 1: 'checking', 2: 'checking' })
  const [services, setServices] = useState<ServiceStatus[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const [online1, online2, model1Enabled, svc] = await Promise.all([
        fetchModelOnline(1),
        fetchModelOnline(2),
        fetchModel1Enabled(),
        fetchServices(),
      ])
      if (cancelled) return
      setModels({
        1: !online1 ? 'offline' : model1Enabled ? 'online' : 'locked',
        2: online2 ? 'online' : 'offline',
      })
      if (svc) setServices(svc)
    }
    refresh()
    const timer = setInterval(refresh, STATUS_POLL_MS)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return { models, services }
}

const BADGE_STYLES = {
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  gray: 'bg-black/5 text-foreground/60 dark:bg-white/10',
} as const

const DOT_STYLES = {
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  gray: 'bg-foreground/30',
} as const

function StatusBadge({ tone, children }: { tone: keyof typeof BADGE_STYLES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[tone]}`} />
      {children}
    </span>
  )
}

const MODEL_STATE_VIEW: Record<ModelState, { tone: keyof typeof BADGE_STYLES; label: string; note?: string }> = {
  checking: { tone: 'gray', label: '確認中' },
  online: { tone: 'green', label: '起動中' },
  offline: { tone: 'red', label: '停止中', note: 'AIサーバーが起動していないため、今はこのモデルを使えません。' },
  locked: { tone: 'amber', label: '利用停止中', note: '講師により一時的に利用停止されています。' },
}

const SERVICE_STATE_VIEW: Record<ServiceState, { tone: keyof typeof BADGE_STYLES; label: string }> = {
  online: { tone: 'green', label: '起動中' },
  offline: { tone: 'red', label: '停止中' },
  unconfigured: { tone: 'gray', label: '未設定' },
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<PersonalStats | null>(null)
  const [loaded, setLoaded] = useState(false)
  const { models: modelStates, services } = useSystemStatus()

  useEffect(() => {
    startTransition(() => {
      setStats(loadPersonalStats())
      setLoaded(true)
    })
  }, [])

  // 固定の2モデルに加え、過去に別名で記録された利用実績があればそれも表示する。
  const modelCards: { name: string; state: ModelState | null }[] = [
    ...FIXED_MODELS.map((m) => ({ name: m.name, state: modelStates[m.index] })),
    ...Object.keys(stats?.models ?? {})
      .filter((name) => !FIXED_MODELS.some((m) => m.name === name))
      .map((name) => ({ name, state: null })),
  ]

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

          </>
        )}

        {loaded && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">モデル別のコスト・速度比較</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {modelCards.map(({ name, state }) => {
                const m = stats?.models[name]
                const view = state ? MODEL_STATE_VIEW[state] : null
                return (
                  <div key={name} className="rounded-xl border border-black/10 p-4 dark:border-white/15">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{name}</p>
                      {view && <StatusBadge tone={view.tone}>{view.label}</StatusBadge>}
                    </div>
                    <p className="mt-1 text-xs text-foreground/50">
                      {m ? `利用件数 ${m.requestCount.toLocaleString('ja-JP')}件` : 'まだ利用がありません'}
                    </p>
                    {view?.note && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{view.note}</p>}
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-foreground/60">1件あたりコスト</p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                          {m && m.requestCount > 0 ? formatJPY(m.estimatedCost / m.requestCount) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-foreground/60">平均レスポンス時間</p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                          {(() => {
                            const ms = m ? averageLatencyMs(m) : null
                            return ms != null ? `${(ms / 1000).toFixed(1)}秒` : '-'
                          })()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-foreground/60" title="出力トークン数 ÷ 応答時間（待ち時間を含む）">生成速度</p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                          {(() => {
                            const tps = m ? tokensPerSecond(m) : null
                            return tps != null ? `${tps.toFixed(1)} tok/s` : '-'
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">関連サービスの稼働状況</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {services === null ? (
              <p className="text-sm text-foreground/40 animate-pulse">確認中...</p>
            ) : (
              services.map((svc) => {
                const view = SERVICE_STATE_VIEW[svc.state]
                return (
                  <div key={svc.key} className="rounded-xl border border-black/10 p-4 dark:border-white/15">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{svc.label}</p>
                      <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-foreground/50">{svc.description}</p>
                  </div>
                )
              })
            )}
          </div>
        </section>

        <p className="text-xs text-foreground/40">
          トークンはAIとのやり取りの課金単位で、文章の長さに応じて増減します。推定コストは、同規模のモデルをクラウドAPI経由で使った場合の参考換算値です（このアプリはローカル実行のため実際の課金はありません）。
        </p>
      </div>
    </div>
  )
}
