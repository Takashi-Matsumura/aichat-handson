'use client'

import Link from 'next/link'

export type ModelInfo = { model: string | null; label: string | null; online: boolean; ctxSize: number | null }

type Props = {
  modelInfos: Record<1 | 2, ModelInfo>
  selectedModel: 1 | 2
  // 管理者が /presenter からモデル1(gemma-4-12b)を一時的に利用停止できる（大人数開催時の負荷対策）
  model1Enabled: boolean
  panelOpen: boolean
  // ブラウザに保存した設定の復元が済むまで、資料パネルの開閉ボタンは出さない
  panelMounted: boolean
  onSwitchModel: (n: 1 | 2) => void
  onTogglePanel: () => void
}

// 画面に表示するモデル名。表示名(環境変数)があればそれを、なければモデルファイル名を短くして使う。
function shortModelName(info: ModelInfo, n: 1 | 2): string {
  if (info.label) return info.label
  if (!info.model) return `モデル ${n}`
  const base = info.model.replace(/\.gguf$/i, '').replace(/[_]/g, '-')
  const parts = base.split('-')
  return parts.slice(0, 3).join('-')
}

export function ChatHeader({ modelInfos, selectedModel, model1Enabled, panelOpen, panelMounted, onSwitchModel, onTogglePanel }: Props) {
  return (
    <header className="flex-none bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 px-4 py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="flex items-center gap-2 justify-self-start">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ocean-700 flex-none">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          <circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none" />
        </svg>
        <h1 className="text-base font-semibold text-gray-800 dark:text-zinc-100">
          AI チャット
        </h1>
        <span className="hidden sm:block text-gray-300 dark:text-zinc-600 select-none">|</span>
        <p className="hidden sm:block text-xs text-gray-400 dark:text-zinc-500">
          Powered by llama.cpp + Gemma
        </p>
      </div>
      {/* モデル選択（パネルを閉じているときは手動切替可、開いているときはページに応じて自動切替） */}
      <div className="flex items-center gap-1 rounded-xl border border-gray-200 dark:border-zinc-600 p-0.5 justify-self-center">
        {([1, 2] as const).map((n) => {
          const locked = n === 1 && !model1Enabled
          return (
          <button
            key={n}
            type="button"
            disabled={locked}
            onClick={() => { if (!panelOpen) onSwitchModel(n) }}
            title={
              locked
                ? '管理者により一時的に利用停止中です'
                : panelOpen
                  ? 'ハンズオンページに応じて自動切替'
                  : (modelInfos[n].model ?? `ポート ${n === 1 ? 8080 : 8081}`)
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              locked
                ? 'text-gray-300 dark:text-zinc-600 cursor-not-allowed opacity-60'
                : selectedModel === n
                  ? 'bg-ocean-700 text-white'
                  : panelOpen
                    ? 'text-gray-500 dark:text-zinc-400 cursor-default'
                    : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-none ${
                modelInfos[n].online ? 'bg-green-400' : 'bg-gray-300 dark:bg-zinc-600'
              }`}
            />
            {shortModelName(modelInfos[n], n)}
          </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 justify-self-end">
        {/* 確認テスト（ハンズオン後の理解度チェック）へのリンク */}
        <Link
          href="/quiz"
          title="確認テスト"
          aria-label="確認テスト"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="2" width="8" height="4" rx="1" />
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <path d="m9 14 2 2 4-4" />
          </svg>
        </Link>
        {/* AI利用状況ダッシュボードへのリンク */}
        <Link
          href="/analytics"
          title="AI利用状況ダッシュボード"
          aria-label="AI利用状況ダッシュボード"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </Link>
        {panelMounted && (
          <button
            onClick={onTogglePanel}
            title={panelOpen ? 'テキストを閉じる' : 'テキストを開く'}
            aria-label={panelOpen ? 'テキストを閉じる' : 'テキストを開く'}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
              panelOpen
                ? 'border-ocean-400 bg-ocean-50 text-ocean-700 dark:border-ocean-500 dark:bg-ocean-900/30 dark:text-ocean-400'
                : 'border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </button>
        )}
      </div>
    </header>
  )
}
