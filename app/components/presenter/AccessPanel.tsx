'use client'

import { QRCodeSVG } from 'qrcode.react'
import type { AccessInfo } from './useAccessInfo'

// 「アクセスURL」タブ。受講者向けURLのQRコードとコピー、モデル情報とモデル1の利用可否の切り替え。
// 状態と操作は useAccessInfo(講師画面で保持)から受け取る。
export function AccessPanel({ access }: { access: AccessInfo }) {
  const { url, copied, copyUrl, modelInfos, model1Enabled, updatingLock, toggleModel1 } = access
  return (
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
  )
}
