import Link from 'next/link'
import { cookies } from 'next/headers'
import { getSummary, getModelStats } from '@/lib/analytics/analytics'
import { resolveDateRange, toURLSearchParams } from '@/lib/analytics/analytics-query'
import { StatTile } from '@/app/components/dashboard/StatTile'

// インメモリストアの最新状態を都度反映するため、キャッシュせず常に動的にレンダリングする。
export const dynamic = 'force-dynamic'

// チャットAPIが発行するセッションCookie。app/api/chat/route.ts の SESSION_COOKIE と同じ値。
const SESSION_COOKIE = 'handson_sid'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const range = resolveDateRange(toURLSearchParams(await searchParams))
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value

  const [summary, models] = sessionId
    ? await Promise.all([getSummary(range, sessionId), getModelStats(range, sessionId)])
    : [null, []]

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
              この画面はあなたの接続セッション分だけを集計しています。会場全体の統計ではありません。
            </p>
          </div>
        </div>

        {!summary || summary.requestCount === 0 ? (
          <p className="rounded-xl border border-black/10 p-6 text-sm text-foreground/60 dark:border-white/15">
            まだチャットの利用履歴がありません。チャット画面で質問を送ると、ここに利用状況が表示されます。
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatTile label="質問した回数" value={summary.requestCount.toLocaleString('ja-JP')} />
              <StatTile label="入力トークン" value={summary.inputTokens.toLocaleString('ja-JP')} />
              <StatTile label="出力トークン" value={summary.outputTokens.toLocaleString('ja-JP')} />
              <StatTile
                label="推定コスト（クラウドAI換算）"
                value={`$${summary.estimatedCost.toFixed(4)}`}
                hint="実際の課金はありません。同規模モデルをクラウドAPIで使った場合の参考値です"
              />
              <StatTile
                label="平均レスポンス時間"
                value={summary.averageLatencyMs != null ? `${(summary.averageLatencyMs / 1000).toFixed(1)}秒` : '-'}
              />
            </div>

            {models.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">モデル別のコスト・速度比較</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {models.map((m) => (
                    <div key={`${m.provider}:${m.model}`} className="rounded-xl border border-black/10 p-4 dark:border-white/15">
                      <p className="text-sm font-semibold">{m.model}</p>
                      <p className="mt-1 text-xs text-foreground/50">利用件数 {m.requestCount.toLocaleString('ja-JP')}件</p>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-foreground/60">1件あたりコスト</p>
                          <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            ${(m.estimatedCost / m.requestCount).toFixed(5)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-foreground/60">平均レスポンス時間</p>
                          <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {m.averageLatencyMs != null ? `${(m.averageLatencyMs / 1000).toFixed(1)}秒` : '-'}
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
