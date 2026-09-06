'use client'

import { useEffect, useState } from 'react'

type Props = {
  mode: 'create' | 'edit'
  initialTitle: string
  initialBody: string
  saving: boolean
  error: string | null
  onClose: () => void
  onSave: (title: string, body: string) => void
}

// プロンプトの作成・編集を担うモーダル。app/components/PromptBroadcastModal.tsx
// (受講者向け)の殻(オーバーレイ・Escapeハンドラ・ヘッダーバー・フッター)を踏襲する。
// 呼び出し側は mode/prompt.id に応じた key を付けて再マウントさせることで、
// 開くたびに初期値を渡し直す前提(内部で同期用のuseEffectは持たない)。
export function PromptEditModal({ mode, initialTitle, initialBody, saving, error, onClose, onSave }: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody] = useState(initialBody)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'create' ? '新しいプロンプト' : 'プロンプトを編集'}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-700 flex flex-col overflow-hidden"
      >
        <div className="flex-none flex items-center justify-between gap-3 px-5 py-3 bg-ocean-700 dark:bg-ocean-900">
          <h2 className="text-sm font-semibold text-white truncate">
            {mode === 'create' ? '新しいプロンプト' : 'プロンプトを編集'}
          </h2>
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

        <div className="flex-1 px-5 py-4 flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <label className="text-xs text-gray-400 dark:text-zinc-500">タイトル（受講者には表示されません）</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例: 演習1 やさしい説明"
            className="w-full rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-1.5 text-sm text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400"
          />
          <label className="text-xs text-gray-400 dark:text-zinc-500">プロンプト本文（受講者の画面にそのまま表示されます）</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="受講者に配信するプロンプトを入力してください"
            rows={10}
            className="w-full rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-2 text-sm font-mono text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400 resize-y"
          />
        </div>

        <div className="flex-none flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onSave(title, body)}
            disabled={!title.trim() || saving}
            className="rounded-lg px-3 py-1.5 text-sm font-medium bg-ocean-700 text-white hover:bg-ocean-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
