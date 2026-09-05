'use client'

import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { AdminStatsPanel } from '@/app/components/dashboard/AdminStatsPanel'

type RagStatus = {
  fileCount: number
  chunkCount: number
  builtAt: string | null
  dims: number | null
  error: string | null
  online: boolean
}

type SourceFile = {
  relPath: string
  content: string
  mtimeMs: number
  size: number
}

type Tab = 'access' | 'rag' | 'stats'

export default function PresenterPage() {
  type ModelInfo = { model: string | null; ctxSize: number | null; parallel: number | null; label: string | null }

  const [tab, setTab] = useState<Tab>('access')
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [modelInfos, setModelInfos] = useState<Record<1 | 2, ModelInfo | null>>({ 1: null, 2: null })
  const [model1Enabled, setModel1EnabledState] = useState<boolean | null>(null)
  const [updatingLock, setUpdatingLock] = useState(false)
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null)
  const [reindexing, setReindexing] = useState(false)
  const [sources, setSources] = useState<SourceFile[] | null>(null)
  // relPath -> 未保存の編集内容。保存済みの内容は sources 側にのみ持つ。
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [savingPath, setSavingPath] = useState<string | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newFileContent, setNewFileContent] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)

  // 再構築ボタン(handleReindex)や保存後の再取得からも呼ぶため、useEffect内ローカル関数
  // ではなくコンポーネントスコープの関数として定義する。
  async function fetchRagStatus() {
    try {
      const res = await fetch('/api/rag/status')
      const data = await res.json()
      setRagStatus(data)
    } catch {
      setRagStatus(null)
    }
  }

  async function fetchSources() {
    try {
      const res = await fetch('/api/admin/rag-sources')
      const data = await res.json()
      setSources(data.sources ?? [])
    } catch {
      setSources(null)
    }
  }

  useEffect(() => {
    setUrl(window.location.origin)

    async function fetchAll() {
      const results = await Promise.allSettled([
        fetch('/api/model-info?n=1').then((r) => r.json()),
        fetch('/api/model-info?n=2').then((r) => r.json()),
      ])
      setModelInfos({
        1: results[0].status === 'fulfilled' ? results[0].value : null,
        2: results[1].status === 'fulfilled' ? results[1].value : null,
      })
    }
    fetchAll()

    fetch('/api/admin/model-lock')
      .then((r) => r.json())
      .then((data) => setModel1EnabledState(data.model1Enabled !== false))
      .catch(() => setModel1EnabledState(true))

    fetchRagStatus()
    fetchSources()
  }, [])

  // 再構築に失敗しても既存インデックスは維持される(indexer.ts参照)。
  // 結果によらずstatusを取り直せば、成功/失敗いずれの状態も画面に反映される。
  async function handleReindex() {
    if (reindexing) return
    setReindexing(true)
    try {
      await fetch('/api/admin/rag-reindex', { method: 'POST' })
    } finally {
      await fetchRagStatus()
      setReindexing(false)
    }
  }

  function toggleExpanded(relPath: string) {
    setExpandedPath((prev) => (prev === relPath ? null : relPath))
    setDeleteConfirmPath(null)
  }

  async function handleDeleteSource(relPath: string) {
    setDeletingPath(relPath)
    setSourceError(null)
    try {
      const res = await fetch('/api/admin/rag-sources', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relPath }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSourceError(data.error ?? '削除に失敗しました')
        return
      }
      setDeleteConfirmPath(null)
      if (expandedPath === relPath) setExpandedPath(null)
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[relPath]
        return next
      })
      await Promise.all([fetchSources(), fetchRagStatus()])
    } catch {
      setSourceError('削除に失敗しました')
    } finally {
      setDeletingPath(null)
    }
  }

  // 新規作成・編集保存・D&Dインポートの3箇所から呼ぶ共通の保存処理。
  // 成功時はnull、失敗時はエラーメッセージを返す(呼び出し側の状態管理とは分離する)。
  async function saveSourceFile(relPath: string, content: string): Promise<string | null> {
    try {
      const res = await fetch('/api/admin/rag-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relPath, content }),
      })
      const data = await res.json()
      if (!res.ok) return data.error ?? '保存に失敗しました'
      return null
    } catch {
      return '保存に失敗しました'
    }
  }

  async function handleSaveSource(relPath: string) {
    const source = sources?.find((s) => s.relPath === relPath)
    const content = drafts[relPath] ?? source?.content ?? ''
    setSavingPath(relPath)
    setSourceError(null)
    const error = await saveSourceFile(relPath, content)
    if (error) {
      setSourceError(error)
    } else {
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[relPath]
        return next
      })
      await Promise.all([fetchSources(), fetchRagStatus()])
    }
    setSavingPath(null)
  }

  async function handleCreateSource() {
    const nameRaw = newFileName.trim()
    if (!nameRaw || creatingNew) return
    const relPath = /\.(md|markdown|txt)$/i.test(nameRaw) ? nameRaw : `${nameRaw}.md`
    setCreatingNew(true)
    setSourceError(null)
    const error = await saveSourceFile(relPath, newFileContent)
    if (error) {
      setSourceError(error)
    } else {
      setNewFileName('')
      setNewFileContent('')
      setAddingNew(false)
      setExpandedPath(relPath)
      await Promise.all([fetchSources(), fetchRagStatus()])
    }
    setCreatingNew(false)
  }

  // 既存の.md/.txtファイルをドラッグ&ドロップしたときの一括インポート。
  // フォーム入力を介さず、ファイル名と中身をそのままソースとして保存する
  // (同名ファイルが既にあれば上書き＝保存APIの仕様に準拠)。
  const ACCEPTED_SOURCE_EXTENSIONS = /\.(md|markdown|txt)$/i

  async function importDroppedFiles(fileList: FileList) {
    const files = Array.from(fileList)
    if (files.length === 0 || importing) return
    setImporting(true)
    setSourceError(null)
    const errors: string[] = []
    let successCount = 0
    for (const file of files) {
      if (!ACCEPTED_SOURCE_EXTENSIONS.test(file.name)) {
        errors.push(`${file.name}: .md または .txt のみ追加できます`)
        continue
      }
      const content = await file.text()
      const error = await saveSourceFile(file.name, content)
      if (error) {
        errors.push(`${file.name}: ${error}`)
      } else {
        successCount++
      }
    }
    if (errors.length > 0) setSourceError(errors.join(' / '))
    // D&Dで登録できた場合、手動入力用の「新しいソースを追加」フォームは役目が無いので閉じる。
    if (successCount > 0 && addingNew) {
      setAddingNew(false)
      setNewFileName('')
      setNewFileContent('')
    }
    await Promise.all([fetchSources(), fetchRagStatus()])
    setImporting(false)
  }

  function handleSourceDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDraggingOver(false)
    if (e.dataTransfer.files.length > 0) importDroppedFiles(e.dataTransfer.files)
  }

  function handleSourceDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (!isDraggingOver) setIsDraggingOver(true)
  }

  function handleSourceDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    // 子要素間の移動でも発火するため、コンテナの外に出た場合のみ解除する。
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsDraggingOver(false)
  }

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
      setModel1EnabledState(data.model1Enabled !== false)
    } catch {
      // 失敗時は変更しない
    } finally {
      setUpdatingLock(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex flex-col items-center px-6 py-10 relative">
      <div className={`w-full flex flex-col items-center gap-8 mx-auto transition-[max-width] ${tab === 'stats' ? 'max-w-4xl' : tab === 'rag' ? 'max-w-2xl' : 'max-w-md'}`}>

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

        {/* 表示切り替えタブ */}
        <div className="w-full flex items-center gap-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('access')}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'access'
                ? 'bg-ocean-700 text-white'
                : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700'
            }`}
          >
            アクセスURL
          </button>
          <button
            type="button"
            onClick={() => setTab('rag')}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'rag'
                ? 'bg-ocean-700 text-white'
                : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700'
            }`}
          >
            RAGソース
          </button>
          <button
            type="button"
            onClick={() => setTab('stats')}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'stats'
                ? 'bg-ocean-700 text-white'
                : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700'
            }`}
          >
            利用統計
          </button>
        </div>

        {tab === 'access' && (
        <>
        {/* QRコード */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-zinc-700">
          {url ? (
            <QRCodeSVG
              value={url}
              size={260}
              level="M"
              bgColor="#ffffff"
              fgColor="#1e1b4b"
            />
          ) : (
            <div className="w-[260px] h-[260px] flex items-center justify-center">
              <span className="text-gray-300 dark:text-zinc-600 text-sm animate-pulse">読み込み中...</span>
            </div>
          )}
        </div>

        {/* URL表示 + コピーボタン */}
        <div className="w-full flex items-center gap-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 shadow-sm">
          <span className="flex-1 text-base font-mono text-gray-800 dark:text-zinc-100 break-all leading-snug">
            {url || '取得中...'}
          </span>
          <button
            type="button"
            onClick={copyUrl}
            title="URLをコピー"
            className={`flex-none flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
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
          </button>
        </div>

        {/* モデル情報（gemma-4-12bのみ、利用可否のトグルをあわせて表示） */}
        <div className="w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 shadow-sm flex flex-col gap-3">
          <span className="text-xs text-gray-400 dark:text-zinc-500">使用モデル</span>
          {modelInfos[1] === null && modelInfos[2] === null ? (
            <span className="text-gray-300 dark:text-zinc-600 text-sm animate-pulse">取得中...</span>
          ) : (
            ([1, 2] as const).map((n) => {
              const info = modelInfos[n]
              if (!info?.model) return null
              return (
                <div key={n} className="flex items-start gap-2.5">
                  <svg className="flex-none mt-0.5 text-ocean-400 dark:text-ocean-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                    <path d="M9 18h6"/>
                    <path d="M10 22h4"/>
                  </svg>
                  <div className="flex flex-col min-w-0 gap-0.5 flex-1">
                    {info.label && (
                      <span className="text-xs text-ocean-700 dark:text-ocean-400 font-medium">{info.label}</span>
                    )}
                    <span className="text-sm font-mono text-gray-700 dark:text-zinc-200 break-all leading-snug">
                      {info.model}
                    </span>
                    {(info.ctxSize !== null || info.parallel !== null) && (
                      <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono">
                        {info.ctxSize !== null && `ctx-size: ${info.ctxSize.toLocaleString()} tokens`}
                        {info.ctxSize !== null && info.parallel !== null && '  /  '}
                        {info.parallel !== null && `parallel: ${info.parallel}`}
                      </span>
                    )}
                  </div>
                  {n === 1 && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={model1Enabled === true}
                      aria-label="gemma-4-12b を受講者に利用させる"
                      title={model1Enabled ? '受講者が利用可能（クリックで一時停止）' : '受講者は利用不可（クリックで再開）'}
                      onClick={toggleModel1}
                      disabled={model1Enabled === null || updatingLock}
                      className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        model1Enabled ? 'bg-ocean-700' : 'bg-gray-300 dark:bg-zinc-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          model1Enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
                </div>
              )
            })
          )}
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 pt-1 border-t border-gray-100 dark:border-zinc-700">
            gemma-4-12bは大人数開催時の負荷対策として一時停止できます（恒久的に使わない場合はllama-server自体の停止を推奨）
          </p>
        </div>
        </>
        )}

        {tab === 'rag' && (
        <>
        {/* RAG知識ソース（インデックスの状態） */}
        <div className="w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400 dark:text-zinc-500">RAG知識ソース</span>
            <button
              type="button"
              onClick={handleReindex}
              disabled={reindexing}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={reindexing ? 'animate-spin' : ''}>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              {reindexing ? '再構築中...' : '知識ソースを再読み込み'}
            </button>
          </div>
          {ragStatus === null ? (
            <span className="text-gray-300 dark:text-zinc-600 text-sm animate-pulse">取得中...</span>
          ) : (
            <>
              <span className="text-sm text-gray-700 dark:text-zinc-200">
                {ragStatus.fileCount}ファイル / {ragStatus.chunkCount}チャンク
                {ragStatus.dims !== null && `（${ragStatus.dims}次元）`}
              </span>
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                埋め込みサーバー: {ragStatus.online ? (
                  <span className="text-green-600 dark:text-green-400">オンライン</span>
                ) : (
                  <span className="text-red-500 dark:text-red-400">オフライン</span>
                )}
                {ragStatus.builtAt && `　/　最終構築: ${new Date(ragStatus.builtAt).toLocaleTimeString('ja-JP')}`}
              </span>
              {ragStatus.error && (
                <span className="text-xs text-red-500 dark:text-red-400">エラー: {ragStatus.error}</span>
              )}
            </>
          )}
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            knowledgeフォルダに資料(.md / .txt)を置くと自動でインデックス化されます。ファイルを追加・変更した直後にすぐ反映したい場合は上のボタンを押してください。
          </p>
        </div>

        {/* ソース一覧（閲覧・編集・保存。既存ファイルのドラッグ&ドロップにも対応） */}
        <div
          onDragOver={handleSourceDragOver}
          onDragLeave={handleSourceDragLeave}
          onDrop={handleSourceDrop}
          className={`w-full flex flex-col gap-3 rounded-xl border-2 border-dashed p-3 -m-3 transition-colors ${
            isDraggingOver
              ? 'border-ocean-400 bg-ocean-50/50 dark:bg-ocean-900/10'
              : 'border-transparent'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 dark:text-zinc-500">
              ソース一覧{sources !== null && `（${sources.length}件）`}
              {importing && <span className="ml-2 text-ocean-600 dark:text-ocean-400 animate-pulse">取り込み中...</span>}
            </span>
            <button
              type="button"
              onClick={() => setAddingNew((prev) => !prev)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-ocean-700 hover:bg-ocean-50 dark:text-ocean-400 dark:hover:bg-ocean-900/20 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              新しいソースを追加
            </button>
          </div>

          {isDraggingOver && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-ocean-300 dark:border-ocean-700 bg-white/70 dark:bg-zinc-800/70 px-4 py-6 text-sm text-ocean-700 dark:text-ocean-400 pointer-events-none">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              ここにドロップしてソースを追加（.md / .txt）
            </div>
          )}

          {sourceError && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {sourceError}
            </p>
          )}

          {addingNew && (
            <div className="w-full bg-white dark:bg-zinc-800 border border-ocean-200 dark:border-ocean-800 rounded-xl px-4 py-3 shadow-sm flex flex-col gap-2">
              <label className="text-xs text-gray-400 dark:text-zinc-500">
                ファイル名（.md / .txt。拡張子省略時は.md扱い）
              </label>
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="例: company-profile.md"
                className="w-full rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-1.5 text-sm font-mono text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400"
              />
              <textarea
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
                placeholder="資料の本文をMarkdownで入力してください"
                rows={8}
                className="w-full rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-2 text-sm font-mono text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400 resize-y"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setAddingNew(false); setNewFileName(''); setNewFileContent('') }}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleCreateSource}
                  disabled={!newFileName.trim() || creatingNew}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-ocean-700 text-white hover:bg-ocean-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingNew ? '作成中...' : '作成して保存'}
                </button>
              </div>
            </div>
          )}

          {sources === null ? (
            <span className="text-gray-300 dark:text-zinc-600 text-sm animate-pulse">取得中...</span>
          ) : sources.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-zinc-500">
              まだソースがありません。「新しいソースを追加」から作成するか、手元の.md / .txtファイルをこの画面にドラッグ&ドロップしてください。
            </p>
          ) : (
            sources.map((source) => {
              const isExpanded = expandedPath === source.relPath
              const draft = drafts[source.relPath] ?? source.content
              const isDirty = draft !== source.content
              const isSaving = savingPath === source.relPath
              const isConfirmingDelete = deleteConfirmPath === source.relPath
              const isDeleting = deletingPath === source.relPath
              return (
                <div key={source.relPath} className="w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
                  <div className="w-full flex items-center gap-2 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(source.relPath)}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-gray-400 dark:text-zinc-500">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className="flex-1 min-w-0 text-sm font-mono text-gray-700 dark:text-zinc-200 truncate">
                        {source.relPath}
                      </span>
                      {isDirty && (
                        <span className="flex-none text-[11px] text-amber-600 dark:text-amber-400">未保存</span>
                      )}
                      <span className="flex-none text-xs text-gray-400 dark:text-zinc-500 font-mono">
                        {(source.size / 1024).toFixed(1)} KB
                      </span>
                    </button>

                    {isConfirmingDelete ? (
                      <div className="flex-none flex items-center gap-1.5">
                        <span className="text-[11px] text-red-500 dark:text-red-400">削除しますか？</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSource(source.relPath)}
                          disabled={isDeleting}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isDeleting ? '削除中...' : '削除する'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmPath(null)}
                          disabled={isDeleting}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                        >
                          キャンセル
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmPath(source.relPath)}
                        title="このソースを削除"
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

                    <button type="button" onClick={() => toggleExpanded(source.relPath)} className="flex-none">
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
                      <textarea
                        value={draft}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [source.relPath]: e.target.value }))}
                        rows={12}
                        className="w-full mt-3 rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-2 text-sm font-mono text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400 resize-y"
                      />
                      <div className="flex items-center justify-end gap-2">
                        {isDirty && (
                          <button
                            type="button"
                            onClick={() => setDrafts((prev) => {
                              const next = { ...prev }
                              delete next[source.relPath]
                              return next
                            })}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                          >
                            元に戻す
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSaveSource(source.relPath)}
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
        </>
        )}

        {tab === 'stats' && <AdminStatsPanel />}
      </div>
    </div>
  )
}
