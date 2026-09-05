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
        className="relative transition-transform duration-500 ease-in-out [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}
      >
        {/* 表面 */}
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/15 [backface-visibility:hidden]">
          <p className="text-xs text-foreground/60">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-foreground/50">{hint}</p>}
          <p className="mt-2 text-[11px] text-foreground/40">クリックで単価を表示</p>
        </div>

        {/* 裏面: 円換算の元になっている単価と為替レート */}
        <div
          className="absolute inset-0 rounded-xl border border-black/10 p-4 dark:border-white/15 [backface-visibility:hidden]"
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
            為替レート $1 ≈ ¥{exchangeRate}（教材用の参考値） ・ クリックで戻る
          </p>
        </div>
      </div>
    </button>
  )
}
