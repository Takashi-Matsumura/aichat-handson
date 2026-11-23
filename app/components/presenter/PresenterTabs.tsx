'use client'

export type PresenterTab = 'access' | 'rag' | 'prompts' | 'stats'

const TABS: { id: PresenterTab; label: string }[] = [
  { id: 'access', label: 'アクセスURL' },
  { id: 'rag', label: 'RAGソース' },
  { id: 'prompts', label: 'プロンプト配信' },
  { id: 'stats', label: '利用統計' },
]

// 講師画面の見出しと、表示切り替えタブ。
export function PresenterTabs({ tab, onChange }: { tab: PresenterTab; onChange: (tab: PresenterTab) => void }) {
  return (
    <>
      {/* ヘッダー */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ocean-700">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            <circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none" />
          </svg>
          <h1 className="text-xl font-bold text-gray-800 dark:text-zinc-100">AI チャット</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-zinc-400">管理者画面</p>
      </div>

      {/* 表示切り替えタブ。スマホ幅では文字を小さく・余白を詰め、ラベルが2行に折り返さないようにする */}
      <div className="aqua-segment w-full flex items-center gap-0 sm:gap-1 rounded-full p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`aqua-segment-item flex-auto sm:flex-1 whitespace-nowrap rounded-full px-1.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium ${tab === id ? 'aqua aqua-blue' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
