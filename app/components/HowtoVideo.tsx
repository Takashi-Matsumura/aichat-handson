'use client'

import { useEffect, useRef, useState } from 'react'
import { HOWTO_CHAPTERS, formatDuration, howtoThumb, howtoVideo } from '@/lib/howto/chapters'

// トップページ（会話が始まる前）に出す、アプリの使い方動画の入口。押すとチャプタ付きのプレーヤーが開く。
// 研修の外でも、操作を独学で確認できるようにするためのもの。
export function HowtoVideoCard() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group mt-6 w-full max-w-60 mx-auto flex flex-col gap-2 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 pb-3 text-center shadow-sm hover:border-ocean-300 dark:hover:border-ocean-600 transition-colors"
      >
        <span className="relative block w-full aspect-video overflow-hidden rounded-xl bg-gray-100 dark:bg-zinc-700">
          {/* eslint-disable-next-line @next/next/no-img-element -- 静的な小さいサムネイル。最適化は不要 */}
          <img src={howtoThumb(HOWTO_CHAPTERS[0].id)} alt="" className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover:bg-black/5 transition-colors">
            <span className="w-10 h-10 rounded-full bg-white/95 shadow flex items-center justify-center text-ocean-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
              </svg>
            </span>
          </span>
        </span>
        <span className="block px-2">
          <span className="block text-sm font-semibold text-gray-800 dark:text-zinc-100">はじめての方へ：使い方の動画</span>
          <span className="block mt-0.5 text-xs text-gray-400 dark:text-zinc-500">
            見たいところから再生できます
          </span>
        </span>
      </button>
      {open && <HowtoVideoModal onClose={() => setOpen(false)} />}
    </>
  )
}

function HowtoVideoModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const chapter = HOWTO_CHAPTERS[current]

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // チャプタを選んだら、頭から再生する（自動再生が止められている環境では、再生ボタンを押してもらう）。
  useEffect(() => {
    videoRef.current?.play().catch(() => {})
  }, [current])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="使い方の動画"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl max-h-full bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-700 flex flex-col overflow-hidden"
      >
        <div className="flex-none flex items-center justify-between gap-3 px-5 py-3 bg-ocean-700 dark:bg-ocean-900">
          <h2 className="text-sm font-semibold text-white truncate">
            使い方の動画　<span className="font-normal text-ocean-100">チャプタ{current + 1}：{chapter.title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex-none w-7 h-7 flex items-center justify-center rounded-lg text-ocean-200 hover:text-white hover:bg-white/20 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          <div className="flex-none lg:flex-1 bg-black flex items-center">
            <video
              ref={videoRef}
              key={chapter.id}
              src={howtoVideo(chapter.id)}
              poster={howtoThumb(chapter.id)}
              controls
              playsInline
              preload="metadata"
              onEnded={() => {
                if (current < HOWTO_CHAPTERS.length - 1) setCurrent(current + 1)
              }}
              className="w-full aspect-video"
            />
          </div>
          <ol className="flex-none lg:w-72 lg:overflow-y-auto p-2 space-y-1">
            {HOWTO_CHAPTERS.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-current={i === current ? 'true' : undefined}
                  className={`w-full flex items-center gap-3 rounded-xl p-2 text-left transition-colors ${
                    i === current
                      ? 'bg-ocean-50 dark:bg-ocean-900/30 ring-1 ring-ocean-300 dark:ring-ocean-600'
                      : 'hover:bg-gray-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 静的な小さいサムネイル。最適化は不要 */}
                  <img src={howtoThumb(c.id)} alt="" className="flex-none w-24 aspect-video rounded-lg object-cover bg-gray-100 dark:bg-zinc-700" />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-medium text-ocean-700 dark:text-ocean-400">
                      チャプタ{i + 1}{c.duration > 0 ? `・${formatDuration(c.duration)}` : ''}
                    </span>
                    <span className="block text-sm font-semibold text-gray-800 dark:text-zinc-100 leading-snug">{c.title}</span>
                    <span className="block text-xs text-gray-400 dark:text-zinc-500 truncate">{c.summary}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
