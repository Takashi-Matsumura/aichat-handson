'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

export type PresenterModelInfo = { model: string | null; ctxSize: number | null; parallel: number | null; label: string | null }

// window.location.origin はページ表示中に変わらないため、変更を購読する必要がない。
function subscribeNothing() {
  return () => {}
}

// 「アクセスURL」タブの状態と操作。受講者向けURLのコピー、モデル情報、モデル1の利用可否の切り替え。
// タブを切り替えても取得し直さないよう、講師画面(app/presenter/page.tsx)で1回だけ呼ぶ。
export function useAccessInfo() {
  // 受講者に案内するURL(このページを開いているオリジン)。サーバー側の描画時は空。
  const url = useSyncExternalStore(subscribeNothing, () => window.location.origin, () => '')
  const [copied, setCopied] = useState(false)
  const [modelInfos, setModelInfos] = useState<Record<1 | 2, PresenterModelInfo | null>>({ 1: null, 2: null })
  const [model1Enabled, setModel1Enabled] = useState<boolean | null>(null)
  const [updatingLock, setUpdatingLock] = useState(false)

  useEffect(() => {
    async function fetchModelInfos() {
      const results = await Promise.allSettled([
        fetch('/api/model-info?n=1').then((r) => r.json()),
        fetch('/api/model-info?n=2').then((r) => r.json()),
      ])
      setModelInfos({
        1: results[0].status === 'fulfilled' ? results[0].value : null,
        2: results[1].status === 'fulfilled' ? results[1].value : null,
      })
    }
    fetchModelInfos()

    fetch('/api/admin/model-lock')
      .then((r) => r.json())
      .then((data) => setModel1Enabled(data.model1Enabled !== false))
      .catch(() => setModel1Enabled(true))
  }, [])

  async function copyUrl() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function toggleModel1() {
    if (model1Enabled === null || updatingLock) return
    const next = !model1Enabled
    setUpdatingLock(true)
    try {
      const res = await fetch('/api/admin/model-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      const data = await res.json()
      setModel1Enabled(data.model1Enabled !== false)
    } catch {
      // 失敗時は変更しない
    } finally {
      setUpdatingLock(false)
    }
  }

  return { url, copied, copyUrl, modelInfos, model1Enabled, updatingLock, toggleModel1 }
}

export type AccessInfo = ReturnType<typeof useAccessInfo>
