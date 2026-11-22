// Web検索で参照したページを表示する折りたたみパネル。
// RAGの SourcesPanel(emerald系)と同じ構造で、区別のため配色を sky 系にしている。
// AIが実際に使った検索キーワードも表示し、「何を調べて答えたのか」を受講者が確かめられるようにする。

import type { WebSearchInfo } from '@/lib/web/prompt'

type Props = {
  web: WebSearchInfo
  open: boolean
  onToggle: () => void
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export default function WebSourcesPanel({ web, open, onToggle }: Props) {
  const label = web.failed
    ? '(検索に失敗しました)'
    : web.sources.length > 0
    ? `(${web.sources.length}件)`
    : '(該当なし)'
  return (
    <div className="rounded-xl border border-sky-200 dark:border-sky-800 overflow-hidden text-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>参照したWebページ {label}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-3 py-2 text-xs text-sky-900 dark:text-sky-200 bg-sky-50/60 dark:bg-sky-900/10 border-t border-sky-200 dark:border-sky-800 max-h-64 overflow-y-auto space-y-3">
          <p className="text-[11px] text-sky-700/80 dark:text-sky-400/80">
            検索キーワード：<span className="font-medium">{web.query || '（なし）'}</span>
          </p>
          {web.failed ? (
            <p>検索サーバーに接続できなかったため、AIの知識だけで回答しています。最新の情報とは限りません。</p>
          ) : web.sources.length === 0 ? (
            <p>関連するWebページは見つかりませんでした。</p>
          ) : (
            <ol className="space-y-3">
              {web.sources.map((s, i) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline decoration-dotted hover:text-sky-600 dark:hover:text-sky-300"
                  >
                    [{i + 1}] {s.title}
                  </a>
                  <div className="text-[11px] text-sky-700/70 dark:text-sky-400/70">
                    {hostname(s.url)}
                    {s.publishedDate ? `（${s.publishedDate}）` : ''}
                  </div>
                  {s.snippet && <p className="mt-0.5">{s.snippet}</p>}
                </li>
              ))}
            </ol>
          )}
          <p className="text-[11px] text-sky-700/70 dark:text-sky-400/70">
            ※ AIは検索結果の抜粋だけを読んで回答しています。大事な情報は元のページで確認しましょう。
          </p>
        </div>
      )}
    </div>
  )
}
