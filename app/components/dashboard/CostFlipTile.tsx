'use client'

import { useState } from 'react'

type ModelPriceEntry = { model: string; inputPer1M: number; outputPer1M: number }

type Props = {
  label: string
  value: string
  hint?: string
  exchangeRate: number
  prices: ModelPriceEntry[]
}

// 推定コストのStatTile。円換算の元になっている単価(トークン料・為替レート)は固定値のため、
// クリックで裏面に回して内訳を確認できるようにする。
export function CostFlipTile({ label, value, hint, exchangeRate, prices }: Props) {
  const [flipped, setFlipped] = useState(false)

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-pressed={flipped}
      aria-label={`${label}: ${flipped ? '単価の内訳を隠す' : '単価の内訳を表示する'}`}
      className="block w-full text-left [perspective:1000px]"
    >
      <div
        className="grid transition-transform duration-500 ease-in-out [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}
      >
        {/* 表と裏は同じグリッドのマスに重ねる。カードの高さは内容の多いほうに揃うので、
            狭い幅で裏面の単価一覧が折り返しても、はみ出さない */}
        {/* 表面 */}
        <div className="aqua-card rounded-xl p-4 [grid-area:1/1] [backface-visibility:hidden]">
          <p className="text-xs text-foreground/60">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-foreground/50">{hint}</p>}
          {/* カード全体がボタンなので、ここは見た目だけのカプセル（span）。押せることが分かる目印にする */}
          <span className="aqua mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            単価を表示
          </span>
        </div>

        {/* 裏面: 円換算の元になっている単価と為替レート */}
        <div
          className="aqua-card rounded-xl p-4 [grid-area:1/1] [backface-visibility:hidden]"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <p className="text-xs text-foreground/60">単価（100万トークンあたり）</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {prices.map((p) => (
              <li key={p.model} className="text-xs tabular-nums">
                <span className="font-medium text-foreground/90">{p.model}</span>
                <span className="text-foreground/60"> 入力 ${p.inputPer1M.toFixed(3)} / 出力 ${p.outputPer1M.toFixed(3)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-foreground/40">
            為替レート $1 ≈ ¥{exchangeRate}（教材用の参考値）
          </p>
          <span className="aqua mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            戻る
          </span>
        </div>
      </div>
    </button>
  )
}
