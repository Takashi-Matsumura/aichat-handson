'use client'

import { useEffect, useState } from 'react'

export type RagStatus = {
  fileCount: number
  chunkCount: number
  builtAt: string | null
  dims: number | null
  error: string | null
  online: boolean
}

export type SourceFile = {
  relPath: string
  content: string
  mtimeMs: number
  size: number
}

// ドラッグ&ドロップで取り込めるファイル(保存APIが受け付ける拡張子と同じ)
const ACCEPTED_SOURCE_EXTENSIONS = /\.(md|markdown|txt)$/i

// 「RAGソース」タブの状態と操作。インデックスの状態・再構築、知識ソースの一覧・作成・編集・削除・取り込み。
// 未保存の編集内容(drafts)をタブ切り替えで失わないよう、講師画面(app/presenter/page.tsx)で1回だけ呼び、
// 状態を画面側に持たせる。
export function useRagSources() {
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
  // ではなくフック直下の関数として定義する。
  async function fetchRagStatus() {
    try {
      const res = await fetch('/api/admin/rag-status')
      if (!res.ok) { setRagStatus(null); return }
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

  async function refresh() {
    await Promise.all([fetchSources(), fetchRagStatus()])
  }

  useEffect(() => {
    // 初期表示に必要なデータを並行して取得する。
    async function fetchAll() {
      await refresh()
    }
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function discardDraft(relPath: string) {
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[relPath]
      return next
    })
  }

  function editDraft(relPath: string, content: string) {
    setDrafts((prev) => ({ ...prev, [relPath]: content }))
  }

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
      discardDraft(relPath)
      await refresh()
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
      discardDraft(relPath)
      await refresh()
    }
    setSavingPath(null)
  }

  function closeNewSourceForm() {
    setAddingNew(false)
    setNewFileName('')
    setNewFileContent('')
  }

  async function handleCreateSource() {
    const nameRaw = newFileName.trim()
    if (!nameRaw || creatingNew) return
    const relPath = ACCEPTED_SOURCE_EXTENSIONS.test(nameRaw) ? nameRaw : `${nameRaw}.md`
    setCreatingNew(true)
    setSourceError(null)
    const error = await saveSourceFile(relPath, newFileContent)
    if (error) {
      setSourceError(error)
    } else {
      closeNewSourceForm()
      setExpandedPath(relPath)
      await refresh()
    }
    setCreatingNew(false)
  }

  // 既存の.md/.txtファイルをドラッグ&ドロップしたときの一括インポート。
  // フォーム入力を介さず、ファイル名と中身をそのままソースとして保存する
  // (同名ファイルが既にあれば上書き＝保存APIの仕様に準拠)。
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
    if (successCount > 0 && addingNew) closeNewSourceForm()
    await refresh()
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

  return {
    ragStatus,
    reindexing,
    handleReindex,
    sources,
    drafts,
    editDraft,
    discardDraft,
    expandedPath,
    toggleExpanded,
    savingPath,
    handleSaveSource,
    sourceError,
    addingNew,
    setAddingNew,
    closeNewSourceForm,
    newFileName,
    setNewFileName,
    newFileContent,
    setNewFileContent,
    creatingNew,
    handleCreateSource,
    isDraggingOver,
    importing,
    handleSourceDrop,
    handleSourceDragOver,
    handleSourceDragLeave,
    deleteConfirmPath,
    setDeleteConfirmPath,
    deletingPath,
    handleDeleteSource,
  }
}

export type RagSources = ReturnType<typeof useRagSources>
