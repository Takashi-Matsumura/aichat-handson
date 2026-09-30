'use client'

import type { RagSources } from './useRagSources'

// 「RAGソース」タブ。インデックスの状態と再構築、知識ソースの一覧・作成・編集・削除・ドラッグ&ドロップでの取り込み。
// 未保存の編集内容をタブ切り替えで失わないよう、状態と操作は useRagSources(講師画面で保持)から受け取る。
export function RagSourcesPanel({ rag }: { rag: RagSources }) {
  const {
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
  } = rag
  return (
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
                onClick={closeNewSourceForm}
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
                      onChange={(e) => editDraft(source.relPath, e.target.value)}
                      rows={12}
                      className="w-full mt-3 rounded-lg border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-3 py-2 text-sm font-mono text-gray-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-ocean-400 resize-y"
                    />
                    <div className="flex items-center justify-end gap-2">
                      {isDirty && (
                        <button
                          type="button"
                          onClick={() => discardDraft(source.relPath)}
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
  )
}
