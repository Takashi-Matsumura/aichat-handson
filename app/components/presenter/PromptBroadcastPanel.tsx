'use client'

import { useEffect, useState } from 'react'

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

// /presenter の「プロンプト配信」タブ本体。app/presenter/page.tsx の RAGソースタブ
// (一覧・作成・編集・削除)と同じ構造を踏襲する: prompts(サーバー正) と
// drafts(未保存の編集内容)を分離し、進行中フラグは「どの行か」をIDで保持する。
export function PromptBroadcastPanel() {
  const [prompts, setPrompts] = useState<Prompt[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string }>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [addingNew, setAddingNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)

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

  function toggleExpanded(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
    setDeleteConfirmId(null)
  }

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

  async function handleSaveEdit(id: string) {
    const prompt = prompts?.find(p => p.id === id)
    const draft = drafts[id] ?? { title: prompt?.title ?? '', body: prompt?.body ?? '' }
    setSavingId(id)
    setError(null)
    const result = await savePromptRequest({ id, title: draft.title, body: draft.body })
    if ('error' in result) {
      setError(result.error)
    } else {
      setDrafts(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setPrompts(result.prompts)
    }
    setSavingId(null)
  }

  async function handleCreate() {
    if (!newTitle.trim() || creatingNew) return
    setCreatingNew(true)
    setError(null)
    const result = await savePromptRequest({ title: newTitle, body: newBody })
    if ('error' in result) {
      setError(result.error)
    } else {
      setNewTitle('')
      setNewBody('')
      setAddingNew(false)
      setPrompts(result.prompts)
    }
    setCreatingNew(false)
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
      if (expandedId === id) setExpandedId(null)
      setDrafts(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
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
          onClick={() => setAddingNew(prev => !prev)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-ocean-700 hover:bg-ocean-50 dark:text-ocean-400 dark:hover:bg-ocean-900/20 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新しいプロンプトを追加
        </button>
      </div>

      {addingNew && (
        <div className="w-full bg-white dark:bg-zinc-800 border border-ocean-200 dark:border-ocean-800 rounded-xl px-4 py-3 shadow-sm flex flex-col gap-2">
          <label className="text-xs text-gray-400 dark:text-zinc-500">タイトル（受講者には表示されません）</label>
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="例: 演習1 やさしい説明"
            className="w-full rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-1.5 text-sm text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400"
          />
          <label className="text-xs text-gray-400 dark:text-zinc-500">プロンプト本文（受講者の画面にそのまま表示されます）</label>
          <textarea
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
            placeholder="受講者に配信するプロンプトを入力してください"
            rows={6}
            className="w-full rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-2 text-sm font-mono text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400 resize-y"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setAddingNew(false); setNewTitle(''); setNewBody('') }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newTitle.trim() || creatingNew}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-ocean-700 text-white hover:bg-ocean-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creatingNew ? '作成中...' : '作成して保存'}
            </button>
          </div>
        </div>
      )}

      {prompts === null ? (
        <span className="text-gray-300 dark:text-zinc-600 text-sm animate-pulse">取得中...</span>
      ) : prompts.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-zinc-500">
          まだプロンプトがありません。「新しいプロンプトを追加」から作成してください。
        </p>
      ) : (
        prompts.map(prompt => {
          const isExpanded = expandedId === prompt.id
          const draft = drafts[prompt.id] ?? { title: prompt.title, body: prompt.body }
          const isDirty = draft.title !== prompt.title || draft.body !== prompt.body
          const isSaving = savingId === prompt.id
          const isSending = sendingId === prompt.id
          const isConfirmingDelete = deleteConfirmId === prompt.id
          const isDeleting = deletingId === prompt.id
          const isLive = broadcast !== null && broadcast.title === prompt.title && broadcast.body === prompt.body
          return (
            <div key={prompt.id} className="w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
              <div className="w-full flex items-center gap-2 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleExpanded(prompt.id)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-gray-400 dark:text-zinc-500">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-zinc-200 truncate">
                    {prompt.title}
                  </span>
                  {isLive && (
                    <span className="flex-none text-[11px] text-emerald-600 dark:text-emerald-400">配信中</span>
                  )}
                  {isDirty && (
                    <span className="flex-none text-[11px] text-amber-600 dark:text-amber-400">未保存</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSend(prompt.id)}
                  disabled={isSending || isDirty}
                  title={isDirty ? '未保存の変更があります。先に保存してください' : '受講者へ配信'}
                  className="flex-none flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-ocean-700 text-white hover:bg-ocean-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  {isSending ? '配信中...' : '配信'}
                </button>

                {isConfirmingDelete ? (
                  <div className="flex-none flex items-center gap-1.5">
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
                )}

                <button type="button" onClick={() => toggleExpanded(prompt.id)} className="flex-none">
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`text-gray-400 dark:text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>
              {isExpanded && (
                <div className="px-4 pb-3 flex flex-col gap-2 border-t border-gray-100 dark:border-zinc-700">
                  <input
                    type="text"
                    value={draft.title}
                    onChange={e => setDrafts(prev => ({ ...prev, [prompt.id]: { ...draft, title: e.target.value } }))}
                    className="w-full mt-3 rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-1.5 text-sm text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400"
                  />
                  <textarea
                    value={draft.body}
                    onChange={e => setDrafts(prev => ({ ...prev, [prompt.id]: { ...draft, body: e.target.value } }))}
                    rows={8}
                    className="w-full rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-2 text-sm font-mono text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400 resize-y"
                  />
                  <div className="flex items-center justify-end gap-2">
                    {isDirty && (
                      <button
                        type="button"
                        onClick={() => setDrafts(prev => {
                          const next = { ...prev }
                          delete next[prompt.id]
                          return next
                        })}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        元に戻す
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(prompt.id)}
                      disabled={!isDirty || isSaving}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium bg-ocean-700 text-white hover:bg-ocean-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSaving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
