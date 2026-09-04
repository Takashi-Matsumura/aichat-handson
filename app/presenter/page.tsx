'use client'

import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Link from 'next/link'

export default function PresenterPage() {
  type ModelInfo = { model: string | null; ctxSize: number | null; parallel: number | null; label: string | null }

  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [modelInfos, setModelInfos] = useState<Record<1 | 2, ModelInfo | null>>({ 1: null, 2: null })

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
  }, [])

  async function copyUrl() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md flex flex-col items-center gap-8">

        {/* ヘッダー */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
              <circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none" />
              <circle cx="15.5" cy="10" r="1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none" />
            </svg>
            <h1 className="text-xl font-bold text-gray-800 dark:text-zinc-100">AI チャット</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-zinc-400">受講者アクセス用 URL</p>
        </div>

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
                : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50'
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

        {/* モデル情報 */}
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
                  <svg className="flex-none mt-0.5 text-indigo-400 dark:text-indigo-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                    <path d="M9 18h6"/>
                    <path d="M10 22h4"/>
                  </svg>
                  <div className="flex flex-col min-w-0 gap-0.5">
                    {info.label && (
                      <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium">{info.label}</span>
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
                </div>
              )
            })
          )}
        </div>

        {/* チャットに戻るリンク */}
        <Link
          href="/"
          className="text-sm text-gray-400 dark:text-zinc-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          チャット画面に戻る
        </Link>
      </div>
    </div>
  )
}
