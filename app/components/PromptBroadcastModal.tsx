'use client'

import { useEffect, useState } from 'react'

type Props = {
  isOpen: boolean
  title: string
  body: string
  onClose: () => void
  onUsePrompt: (text: string) => void
}

// 講師から配信されたプロンプトを受講者側に見せるモーダル。
// このアプリにモーダルの前例が無いため新規実装。コピー成功時の見た目の切り替えは
// app/presenter/page.tsx の copyUrl と同じ「2秒だけチェックマークに変わる」方式に揃える。
export default function PromptBroadcastModal({ isOpen, title, body, onClose, onUsePrompt }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function copyBody() {
    await navigator.clipboard.writeText(body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="講師からのプロンプト"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-700 flex flex-col overflow-hidden"
      >
        <div className="flex-none flex items-center justify-between gap-3 px-5 py-3 bg-ocean-700 dark:bg-ocean-900">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-white">
              <path d="M3 11l18-5v12L3 14v-3z" />
              <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
            </svg>
            <h2 className="text-sm font-semibold text-white truncate">講師からのプロンプト</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex-none w-7 h-7 flex items-center justify-center rounded-lg text-ocean-200 hover:text-white hover:bg-white/20 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          <p className="text-sm font-medium text-gray-700 dark:text-zinc-200">{title}</p>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 dark:bg-zinc-700 px-4 py-3 text-sm font-mono text-gray-800 dark:text-zinc-100">
            {body}
          </pre>
        </div>

        <div className="flex-none flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={copyBody}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              copied
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-ocean-100 text-ocean-700 hover:bg-ocean-200 dark:bg-ocean-900/30 dark:text-ocean-400 dark:hover:bg-ocean-900/50'
            }`}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {copied ? 'コピーしました' : 'コピー'}
          </button>
          <button
            type="button"
            onClick={() => { onUsePrompt(body); onClose() }}
            className="rounded-lg px-3 py-1.5 text-sm font-medium bg-ocean-700 text-white hover:bg-ocean-800 transition-colors"
          >
            入力欄に入れる
          </button>
        </div>
      </div>
    </div>
  )
}
