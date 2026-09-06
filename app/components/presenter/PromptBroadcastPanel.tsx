'use client'

import { useEffect, useState } from 'react'
import { PromptEditModal } from '@/app/components/presenter/PromptEditModal'

type Prompt = {
  id: string
  title: string
  body: string
  updatedAt: string
}

type Broadcast = {
  broadcastId: string
  title: string
  body: string
  sentAt: string
} | null

type Editing = { mode: 'create' } | { mode: 'edit'; prompt: Prompt }

// /presenter の「プロンプト配信」タブ本体。一覧はテーブル表示とし、
// 作成・編集は PromptEditModal に委譲する。prompts(サーバー正)のみを保持し、
// 進行中フラグは「どの行か」をIDで保持する方針は従来通り。
export function PromptBroadcastPanel() {
  const [prompts, setPrompts] = useState<Prompt[] | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState<Editing | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const [broadcast, setBroadcastState] = useState<Broadcast>(null)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [broadcastLoaded, setBroadcastLoaded] = useState(false)
  const [clearingBroadcast, setClearingBroadcast] = useState(false)

  // 作成・保存・削除・配信操作の後はAPIレスポンスのpromptsをそのままsetPromptsするため、
  // fetchPromptsが必要なのは初回マウント時のみ。cancelledフラグでアンマウント後の
  // setStateを防ぐ(app/components/dashboard/AdminStatsPanel.tsxと同じ方針)。
  useEffect(() => {
    let cancelled = false

    async function fetchPrompts() {
      try {
        const res = await fetch('/api/admin/presenter-prompts')
        const data = await res.json()
        if (!cancelled) setPrompts(data.prompts ?? [])
      } catch {
        if (!cancelled) setPrompts(null)
      }
    }

    async function fetchBroadcast() {
      try {
        const res = await fetch('/api/admin/broadcast')
        const data = await res.json()
        if (cancelled) return
        setBroadcastState(data.broadcast ?? null)
        setSubscriberCount(data.subscriberCount ?? 0)
      } catch {
        // 一時的な取得失敗では画面の状態を変えない(次回ポーリングで復帰する)
      } finally {
        if (!cancelled) setBroadcastLoaded(true)
      }
    }

    fetchPrompts()
    fetchBroadcast()
    // 受講者の接続数をリアルタイムに近い形で見せるため、定期的に取り直す。
    const timer = setInterval(fetchBroadcast, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  async function handleSend(id: string) {
    setSendingId(id)
    setError(null)
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '配信に失敗しました')
        return
      }
      setBroadcastState(data.broadcast ?? null)
      setSubscriberCount(data.subscriberCount ?? 0)
    } catch {
      setError('配信に失敗しました')
    } finally {
      setSendingId(null)
    }
  }

  async function handleClearBroadcast() {
    setClearingBroadcast(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/broadcast', { method: 'DELETE' })
      const data = await res.json()
      setBroadcastState(data.broadcast ?? null)
      setSubscriberCount(data.subscriberCount ?? 0)
    } catch {
      setError('配信の取り下げに失敗しました')
    } finally {
      setClearingBroadcast(false)
    }
  }

  // 新規作成・編集保存の2箇所から呼ぶ共通の保存処理。
  // 成功時はprompts一覧、失敗時はエラーメッセージを返す。
  async function savePromptRequest(
    input: { id?: string; title: string; body: string }
  ): Promise<{ prompts: Prompt[] } | { error: string }> {
    try {
      const res = await fetch('/api/admin/presenter-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) return { error: data.error ?? '保存に失敗しました' }
      return { prompts: data.prompts ?? [] }
    } catch {
      return { error: '保存に失敗しました' }
    }
  }

  async function handleSaveFromModal(title: string, body: string) {
    if (!editing || !title.trim() || saving) return
    setSaving(true)
    setModalError(null)
    const input = editing.mode === 'edit' ? { id: editing.prompt.id, title, body } : { title, body }
    const result = await savePromptRequest(input)
    if ('error' in result) {
      setModalError(result.error)
    } else {
      setPrompts(result.prompts)
      setEditing(null)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch('/api/admin/presenter-prompts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '削除に失敗しました')
        return
      }
      setDeleteConfirmId(null)
      setPrompts(data.prompts ?? [])
    } catch {
      setError('削除に失敗しました')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {/* 現在の配信状態 */}
      <div className="w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 shadow-sm flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400 dark:text-zinc-500">配信状態</span>
          <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono">
            接続中の受講者: {subscriberCount}人
          </span>
        </div>
        {!broadcastLoaded ? (
          <span className="text-gray-300 dark:text-zinc-600 text-sm animate-pulse">取得中...</span>
        ) : broadcast ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-zinc-200 font-medium truncate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-ocean-600 dark:text-ocean-400">
                  <path d="M3 11l18-5v12L3 14v-3z" />
                  <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                </svg>
                {broadcast.title}
              </span>
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                配信中 / {new Date(broadcast.sentAt).toLocaleTimeString('ja-JP')}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearBroadcast}
              disabled={clearingBroadcast}
              className="flex-none rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {clearingBroadcast ? '処理中...' : '配信を取り下げる'}
            </button>
          </div>
        ) : (
          <span className="text-sm text-gray-400 dark:text-zinc-500">現在配信中のプロンプトはありません</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* プロンプト一覧 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-zinc-500">
          プロンプト一覧{prompts !== null && `（${prompts.length}件）`}
        </span>
        <button
          type="button"
          onClick={() => { setEditing({ mode: 'create' }); setModalError(null) }}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-ocean-700 hover:bg-ocean-50 dark:text-ocean-400 dark:hover:bg-ocean-900/20 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新しいプロンプトを追加
        </button>
      </div>

      {prompts === null ? (
        <span className="text-gray-300 dark:text-zinc-600 text-sm animate-pulse">取得中...</span>
      ) : prompts.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-zinc-500">
          まだプロンプトがありません。「新しいプロンプトを追加」から作成してください。
        </p>
      ) : (
        <div className="w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-zinc-700 text-xs text-gray-400 dark:text-zinc-500">
                  <th className="px-4 py-2 font-medium">タイトル</th>
                  <th className="px-4 py-2 font-medium">本文</th>
                  <th className="px-4 py-2 font-medium">状態</th>
                  <th className="px-4 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {prompts.map(prompt => {
                  const isSending = sendingId === prompt.id
                  const isConfirmingDelete = deleteConfirmId === prompt.id
                  const isDeleting = deletingId === prompt.id
                  const isLive = broadcast !== null && broadcast.title === prompt.title && broadcast.body === prompt.body
                  const bodyPreview = prompt.body.replace(/\s+/g, ' ').trim()
                  return (
                    <tr
                      key={prompt.id}
                      className="border-b border-gray-100 last:border-0 dark:border-zinc-700/60 hover:bg-gray-50 dark:hover:bg-zinc-700/40 transition-colors"
                    >
                      <td className="px-4 py-2.5 max-w-[16rem]">
                        <span className="flex items-center gap-2 min-w-0">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-gray-400 dark:text-zinc-500">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="min-w-0 truncate text-gray-700 dark:text-zinc-200">{prompt.title}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 max-w-[20rem] text-xs text-gray-400 dark:text-zinc-500">
                        <span className="block truncate" title={bodyPreview}>{bodyPreview}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isLive && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">配信中</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {isConfirmingDelete ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[11px] text-red-500 dark:text-red-400">削除しますか？</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(prompt.id)}
                              disabled={isDeleting}
                              className="rounded-lg px-2 py-1 text-[11px] font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isDeleting ? '削除中...' : '削除する'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              disabled={isDeleting}
                              className="rounded-lg px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                            >
                              キャンセル
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleSend(prompt.id)}
                              disabled={isSending}
                              className="flex-none flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-ocean-700 text-white hover:bg-ocean-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                              </svg>
                              {isSending ? '配信中...' : '配信'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditing({ mode: 'edit', prompt }); setModalError(null) }}
                              title="このプロンプトを編集"
                              className="flex-none w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-zinc-500 hover:text-ocean-700 hover:bg-ocean-50 dark:hover:text-ocean-400 dark:hover:bg-ocean-900/20 transition-colors"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(prompt.id)}
                              title="このプロンプトを削除"
                              className="flex-none w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 dark:text-zinc-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <PromptEditModal
          key={editing.mode === 'edit' ? editing.prompt.id : 'new'}
          mode={editing.mode}
          initialTitle={editing.mode === 'edit' ? editing.prompt.title : ''}
          initialBody={editing.mode === 'edit' ? editing.prompt.body : ''}
          saving={saving}
          error={modalError}
          onClose={() => setEditing(null)}
          onSave={handleSaveFromModal}
        />
      )}
    </div>
  )
}
