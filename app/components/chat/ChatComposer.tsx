'use client'

import type { FormEvent, Ref } from 'react'

type Props = {
  // 会話がまだ始まっていない(入力欄を画面中央に大きく出す)
  isEmpty: boolean
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  inputRef: Ref<HTMLTextAreaElement>
  loading: boolean
  onStop: () => void
  onClearChat: () => void
  // コンテキストウィンドウの使用量。ctxSize が取れないモデルでは表示しない。
  usedTokens: number
  ctxSize: number | null
  ragAvailable: boolean
  ragMode: boolean
  onToggleRag: () => void
  webAvailable: boolean
  webMode: boolean
  onToggleWeb: () => void
  // 推論モードのトグルは推論に対応するモデル(gemma-4-12b)選択時のみ出す
  showThinkingToggle: boolean
  thinking: boolean
  onToggleThinking: () => void
}

// チャットの入力フォーム。コンテキスト使用量・新規チャット・RAG/Web検索/推論モードのトグル・入力欄・送信/停止ボタン。
export function ChatComposer({
  isEmpty,
  input,
  onInputChange,
  onSubmit,
  inputRef,
  loading,
  onStop,
  onClearChat,
  usedTokens,
  ctxSize,
  ragAvailable,
  ragMode,
  onToggleRag,
  webAvailable,
  webMode,
  onToggleWeb,
  showThinkingToggle,
  thinking,
  onToggleThinking,
}: Props) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onSubmit(e as unknown as FormEvent)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 px-3 pt-2 pb-3 ${
        isEmpty
          ? 'w-full max-w-2xl mx-auto rounded-2xl border shadow-sm'
          : 'flex-none border-t'
      }`}
    >
      {/* コンテキストウィンドウ使用量（会話が始まってから表示） */}
      {!isEmpty && ctxSize ? (() => {
        const pct = Math.min((usedTokens / ctxSize) * 100, 100)
        return (
          <div className="mb-2 flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
            <span className="flex-none">コンテキスト</span>
            <div className="aqua-track flex-1 h-2.5 rounded-full overflow-hidden">
              <div
                className={`aqua-bar h-full rounded-full transition-all duration-300 ${
                  pct > 90 ? 'aqua-red' : pct > 70 ? 'aqua-amber' : ''
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="flex-none tabular-nums">
              {usedTokens.toLocaleString()} / {ctxSize.toLocaleString()}
            </span>
          </div>
        )
      })() : null}
      {/* Web検索ONの間は、入力内容をもとにした検索キーワードが外部へ送られることを明示する */}
      {webAvailable && webMode && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-400">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Web検索ON：検索キーワードが外部に送られます。個人情報・社外秘は入力しないでください。
        </p>
      )}
      <div className="flex items-end gap-2">
        {!isEmpty && (
          <button
            type="button"
            onClick={onClearChat}
            title="新規チャット"
            className="aqua flex-none w-9 h-9 flex items-center justify-center rounded-full"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        )}
        {/* RAGトグル */}
        <button
          type="button"
          onClick={onToggleRag}
          disabled={!ragAvailable}
          title={
            !ragAvailable
              ? '知識ソースが登録されていません（knowledgeフォルダに資料を置いてください）'
              : ragMode
              ? 'RAG ON（社内資料を検索して回答。クリックでOFF）'
              : 'RAG OFF（クリックでON）'
          }
          aria-pressed={ragMode}
          className={`aqua flex-none w-9 h-9 flex items-center justify-center rounded-full ${ragAvailable && ragMode ? 'aqua-green' : ''}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="9" y1="7" x2="15" y2="7" />
            <line x1="9" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        {/* Web検索トグル */}
        <button
          type="button"
          onClick={onToggleWeb}
          disabled={!webAvailable}
          title={
            !webAvailable
              ? 'Web検索は利用できません（検索サーバーが設定されていないか、停止しています）'
              : webMode
              ? 'Web検索 ON（インターネットを検索して回答。クリックでOFF）'
              : 'Web検索 OFF（クリックでON）'
          }
          aria-label="Web検索"
          aria-pressed={webMode}
          className={`aqua flex-none w-9 h-9 flex items-center justify-center rounded-full ${webAvailable && webMode ? 'aqua-sky' : ''}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>
        {/* 推論モードトグル（推論に対応するgemma-4-12b選択時のみ表示） */}
        {showThinkingToggle && (
          <button
            type="button"
            onClick={onToggleThinking}
            title={thinking ? '推論モード ON（クリックでOFF）' : '推論モード OFF（クリックでON）'}
            aria-pressed={thinking}
            className={`aqua flex-none w-9 h-9 flex items-center justify-center rounded-full ${thinking ? 'aqua-amber' : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
              <path d="M9 18h6"/>
              <path d="M10 22h4"/>
            </svg>
          </button>
        )}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力（Enterで送信、Shift+Enterで改行）"
          rows={1}
          disabled={loading}
          className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-4 py-2.5 text-base md:text-sm text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-ocean-400 disabled:opacity-50 max-h-32 overflow-y-auto"
          style={{ fieldSizing: 'content' } as React.CSSProperties}
        />
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="生成を停止"
            title="生成を停止"
            className="aqua aqua-red flex-none w-9 h-9 flex items-center justify-center rounded-full"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="送信"
            title="送信"
            className="aqua aqua-blue flex-none w-9 h-9 flex items-center justify-center rounded-full"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </form>
  )
}
