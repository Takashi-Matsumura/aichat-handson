'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function PresenterLogin({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/presenter/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'ログインに失敗しました')
        return
      }
      router.refresh()
    } catch {
      setError('ログインに失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-5 py-6 shadow-sm flex flex-col gap-4"
      >
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-800 dark:text-zinc-100">管理者画面</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">講師用パスワードを入力してください</p>
        </div>
        {configured ? (
          <>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-2 text-sm text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400"
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !password}
              className="w-full rounded-lg bg-ocean-700 hover:bg-ocean-800 disabled:opacity-50 text-white text-sm font-medium py-2 transition-colors"
            >
              {submitting ? '確認中…' : 'ログイン'}
            </button>
          </>
        ) : (
          <p className="text-sm text-red-600 dark:text-red-400">
            環境変数 PRESENTER_PASSWORD が未設定か12文字未満のため、管理者画面は無効です。
            設定してからサーバーを再起動してください。
          </p>
        )}
      </form>
    </div>
  )
}
