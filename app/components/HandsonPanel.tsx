'use client'

import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCjkFriendly from 'remark-cjk-friendly'
import rehypeKatex from 'rehype-katex'

type Props = {
  isOpen: boolean
  isFull: boolean
  onSetFull: (full: boolean) => void
  onUsePrompt: (text: string) => void
  onClose: () => void
  onWebSearchChange?: (enabled: boolean) => void
  onPageChange?: (pageId: number) => void
}

type Page = { id: number; title: string; file: string; webSearch?: boolean }

const PAGES: Page[] = [
  { id: 1, title: 'AIリテラシー', file: '/handson/handson1.md' },
  { id: 2, title: 'AIの仕組み', file: '/handson/handson2.md' },
  { id: 3, title: 'AIとセキュリティ', file: '/handson/handson3.md' },
  { id: 4, title: 'AIの推論とエージェント', file: '/handson/handson4.md' },
  { id: 5, title: 'AIとWeb検索', file: '/handson/handson5.md', webSearch: true },
]

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

const FONT_SIZES = [0.75, 0.875, 1.0, 1.25, 1.5, 1.75]
const DEFAULT_FONT_SIZE_INDEX = 1

export default function HandsonPanel({ isOpen, isFull, onSetFull, onUsePrompt, onClose, onWebSearchChange, onPageChange }: Props) {
  const [currentPage, setCurrentPage] = useState(1)
  const [contents, setContents] = useState<Record<number, string>>({})
  const [fetchError, setFetchError] = useState<Record<number, boolean>>({})
  const [fontSizeIndex, setFontSizeIndex] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_FONT_SIZE_INDEX
    const saved = localStorage.getItem('handson-font-size-index')
    if (saved === null) return DEFAULT_FONT_SIZE_INDEX
    const idx = parseInt(saved, 10)
    return isNaN(idx) ? DEFAULT_FONT_SIZE_INDEX : Math.max(0, Math.min(idx, FONT_SIZES.length - 1))
  })

  // タブのフルラベルが表示領域に収まらない場合は、ラベルではなく番号で表示する
  const tabsWrapRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [compactTabs, setCompactTabs] = useState(false)

  const changeFontSize = (delta: number) => {
    setFontSizeIndex((prev) => {
      const next = Math.max(0, Math.min(prev + delta, FONT_SIZES.length - 1))
      localStorage.setItem('handson-font-size-index', String(next))
      return next
    })
  }

  // マウント時に初期ページをページ親へ通知し、モデルを正しく同期する
  useEffect(() => {
    onPageChange?.(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // パネルが開いた瞬間に現在ページのモデルとWeb検索状態を親へ反映する
  // （フリーチャット中に手動変更した設定をパネルのページ状態で上書きする）
  useEffect(() => {
    if (!isOpen) return
    const page = PAGES.find((p) => p.id === currentPage)
    onPageChange?.(currentPage)
    onWebSearchChange?.(page?.webSearch === true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // 画面幅・フォントサイズの変化に追従し、タブのフルラベルが入り切らなければ番号表示へ切り替える。
  // タブ領域は overflow-hidden（横スクロールバーを出さない）。溢れる手前で番号化して見切れも防ぐ。
  useEffect(() => {
    const wrap = tabsWrapRef.current
    const measure = measureRef.current
    if (!wrap || !measure) return
    const update = () => setCompactTabs(measure.scrollWidth > wrap.clientWidth - 2)
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    ro.observe(measure)
    // Webフォント読込後は自然幅が変わるため再計測する（読込前の細い幅で誤判定するのを防ぐ）
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(update).catch(() => {})
    }
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [currentPage])

  useEffect(() => {
    if (!isOpen || contents[currentPage] !== undefined) return
    const page = PAGES.find((p) => p.id === currentPage)!
    fetch(page.file)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.text()
      })
      .then((text) => setContents((prev) => ({ ...prev, [currentPage]: text })))
      .catch(() => setFetchError((prev) => ({ ...prev, [currentPage]: true })))
  }, [isOpen, currentPage, contents])

  const content = contents[currentPage]
  const hasError = fetchError[currentPage]

  // フォントサイズ変更ボタン（デスクトップはタイトル行、モバイルはタブ行に表示する）
  const fontButtons = (
    <>
      <button
        type="button"
        onClick={() => changeFontSize(-1)}
        disabled={fontSizeIndex === 0}
        aria-label="文字を小さく"
        title="文字を小さく"
        className="px-2 py-0.5 text-xs font-bold rounded text-indigo-200 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors select-none"
      >
        A−
      </button>
      <button
        type="button"
        onClick={() => changeFontSize(1)}
        disabled={fontSizeIndex === FONT_SIZES.length - 1}
        aria-label="文字を大きく"
        title="文字を大きく"
        className="px-2 py-0.5 text-sm font-bold rounded text-indigo-200 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors select-none"
      >
        A＋
      </button>
    </>
  )

  return (
    <aside
      aria-hidden={!isOpen}
      className={`
        flex-none flex flex-col overflow-hidden
        bg-white dark:bg-zinc-800
        border-t-2 border-indigo-400 dark:border-indigo-600
        md:border-t-0 md:border-l-2 md:border-indigo-300 dark:md:border-indigo-700
        md:absolute md:top-0 md:right-0 md:bottom-0 md:w-full md:min-w-0 md:max-h-none md:z-20
        transition-[max-height,max-width] duration-300 ease-in-out
        ${isOpen ? 'max-h-[50vh]' : 'max-h-0'}
        ${!isOpen ? 'md:max-w-0' : isFull ? 'md:max-w-full' : 'md:max-w-[50%]'}
      `}
    >
      <div className="flex-none px-5 pt-3 pb-0 border-b border-indigo-700 dark:border-indigo-700 bg-indigo-600 dark:bg-indigo-800 z-10">
        {/* タイトル行（デスクトップのみ・全画面トグル＋フォントサイズ） */}
        <div className="hidden md:flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {/* 左アイコン: 全画面表示にする */}
            <button
              type="button"
              onClick={() => onSetFull(true)}
              disabled={isFull}
              aria-label="テキストを全画面表示"
              title="全画面表示"
              className="p-0.5 rounded text-indigo-200 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="16 5 16 19 6 12" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-white">
              ハンズオンテキスト
            </h2>
            {/* 右アイコン: 画面半分の表示に戻す */}
            <button
              type="button"
              onClick={() => onSetFull(false)}
              disabled={!isFull}
              aria-label="テキストを画面半分に戻す"
              title="画面半分に戻す"
              className="p-0.5 rounded text-indigo-200 hover:text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="8 5 8 19 18 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1">{fontButtons}</div>
        </div>

        {/* タブ行 ＋ フォントサイズ操作（常時表示）。
            タブが入り切らない場合はラベルではなく番号で表示し、空いたスペースに
            フォントサイズ変更アイコンが収まるようにする。 */}
        <div className="relative flex items-center gap-2">
          <div ref={tabsWrapRef} className="flex-1 min-w-0 overflow-hidden">
            <div className="flex gap-1 pb-px w-max">
              {PAGES.map((page) => {
                const active = currentPage === page.id
                return (
                  <button
                    key={page.id}
                    type="button"
                    title={page.title}
                    onClick={() => {
                      setCurrentPage(page.id)
                      onWebSearchChange?.(page.webSearch === true)
                      onPageChange?.(page.id)
                    }}
                    className={`flex-none ${compactTabs ? 'w-9 px-0 text-center' : 'px-3'} py-1.5 text-xs font-medium rounded-t border-b-2 transition-colors ${
                      active
                        ? 'border-white text-white bg-white/15'
                        : 'border-transparent text-indigo-200 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {compactTabs ? page.id : page.title}
                  </button>
                )
              })}
            </div>
          </div>
          {/* モバイルではタイトル行が隠れるため、フォントサイズ操作をタブ行の右端に表示する */}
          <div className="flex-none md:hidden flex items-center gap-1">{fontButtons}</div>
          {/* 自然幅の計測用（不可視）。フルラベルの合計幅を測り、タブ領域に収まるか判定する。
              aside の overflow-hidden でクリップされるため表示やスクロールには影響しない。 */}
          <div
            ref={measureRef}
            aria-hidden
            className="absolute left-0 top-0 invisible pointer-events-none flex gap-1 whitespace-nowrap"
          >
            {PAGES.map((page) => (
              <span key={page.id} className="flex-none px-3 py-1.5 text-xs font-medium">
                {page.title}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {hasError && (
          <p className="text-sm text-red-500">
            テキストの読み込みに失敗しました。
          </p>
        )}
        {!content && !hasError && isOpen && (
          <p className="text-sm text-gray-400 dark:text-zinc-500 animate-pulse">読み込み中...</p>
        )}
        {content && (
          <div className="prose prose-sm dark:prose-invert max-w-none" style={{ fontSize: `${FONT_SIZES[fontSizeIndex]}rem` }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath, remarkCjkFriendly]}
              rehypePlugins={[rehypeKatex]}
              components={{
                blockquote({ children }) {
                  return <blockquote style={{ quotes: 'none' }}>{children}</blockquote>
                },
                pre({ children }) {
                  const text = extractText(children).trimEnd()
                  return (
                    <div className="relative my-3">
                      <pre className="!bg-gray-100 dark:!bg-zinc-700 !text-gray-800 dark:!text-zinc-200 rounded-lg px-4 py-3 text-sm overflow-x-auto">
                        {children}
                      </pre>
                      <button
                        type="button"
                        onClick={() => onUsePrompt(text)}
                        aria-label="入力"
                        title="入力"
                        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                    </div>
                  )
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </aside>
  )
}
