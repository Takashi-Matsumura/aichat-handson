// RAGで検索・参照した資料を表示する折りたたみパネル。
// app/page.tsx の思考プロセスパネル(amber系)と同じ構造(ヘッダーボタン+chevron+区切り本文)を
// 踏襲しつつ、意味的な区別のため配色をemerald系にしている。

export type SourceRef = {
  id: string
  file: string
  title: string
  snippet: string
  score: number
}

type Props = {
  sources: SourceRef[]
  open: boolean
  onToggle: () => void
}

export default function SourcesPanel({ sources, open, onToggle }: Props) {
  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden text-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span>参照した資料 {sources.length > 0 ? `(${sources.length}件)` : '(該当なし)'}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-3 py-2 text-xs text-emerald-900 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/10 border-t border-emerald-200 dark:border-emerald-800 max-h-48 overflow-y-auto space-y-3">
          {sources.length === 0 ? (
            <p>関連する資料は見つかりませんでした。</p>
          ) : (
            sources.map(s => (
              <div key={s.id}>
                <div className="font-medium">{s.title}</div>
                <div className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
                  {s.file}（類似度 {s.score.toFixed(2)}）
                </div>
                <p className="mt-0.5">{s.snippet}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
