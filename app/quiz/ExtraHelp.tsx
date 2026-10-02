'use client'

import { useEffect, useRef, useState } from 'react'
import { SIMPLER_LEVELS, cleanExplanation, type ExplainKind, type ExplainStreamEvent } from '@/lib/quiz/explain'
import { readNdjsonStream } from '@/lib/quiz/ndjson'
import type { QuizItem } from '@/lib/quiz/schema'

// 追加説明1つ分。key は「種類-段階」で、作り直したときは同じ key のものを置き換える。
type Block = {
  key: string
  kind: ExplainKind
  level: number
  text: string
  status: 'loading' | 'done' | 'error'
  message: string
}

// 解説を読んでも分からなかった受講者向けの追加説明。
// 「もう少し簡単に説明」は押すたびに1段階ずつやさしくなり、「例題」は同じ考え方を使う別の場面を出す。
// 追加説明はこの問題を表示している間だけ持つ(次の問題へ進むと、親の key が変わって破棄される)。
export function ExtraHelp({ item, selected }: { item: QuizItem; selected: number }) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  // 次の問題へ進んだら生成を打ち切る(サーバー側も順番待ち・生成を中断してスロットを空ける)
  useEffect(() => () => controllerRef.current?.abort(), [])

  const busy = blocks.some((b) => b.status === 'loading')
  const nextLevel = blocks.filter((b) => b.kind === 'simpler' && b.status !== 'error').length + 1
  const hasExample = blocks.some((b) => b.kind === 'example' && b.status !== 'error')

  async function request(kind: ExplainKind, level: number) {
    const ac = new AbortController()
    controllerRef.current = ac
    const key = `${kind}-${level}`
    const update = (patch: Partial<Block> | ((b: Block) => Partial<Block>)) =>
      setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...(typeof patch === 'function' ? patch(b) : patch) } : b)))
    const fail = (message: string) => update({ status: 'error', message })
    setBlocks((bs) => [...bs.filter((b) => b.key !== key), { key, kind, level, text: '', status: 'loading', message: '' }])

    try {
      const res = await fetch('/api/quiz/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          level,
          pageId: item.pageId,
          chapter: item.chapter,
          question: item.question,
          choices: item.choices,
          answerIndex: item.answerIndex,
          selected,
          explanation: item.explanation,
        }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        fail(data?.error ?? '説明の作成に失敗しました。もう一度お試しください。')
        return
      }
      let finished = false
      await readNdjsonStream<ExplainStreamEvent>(res, (event) => {
        if (event.type === 'delta') return update((b) => ({ text: b.text + event.text }))
        finished = true
        if (event.type === 'done') update({ status: 'done' })
        else fail(event.message)
      })
      // done/error を受け取らずに切れた場合(サーバー停止など)
      if (!finished) fail('説明の作成が途中で止まりました。もう一度お試しください。')
    } catch {
      if (ac.signal.aborted) return
      fail('サーバーに接続できませんでした。もう一度お試しください。')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {nextLevel <= SIMPLER_LEVELS && (
          <HelpButton disabled={busy} onClick={() => request('simpler', nextLevel)}>
            もう少し簡単に説明（{nextLevel}/{SIMPLER_LEVELS}）
          </HelpButton>
        )}
        {!hasExample && (
          <HelpButton disabled={busy} onClick={() => request('example', 1)}>
            例題を見る
          </HelpButton>
        )}
      </div>

      <div className="flex flex-col gap-3" aria-live="polite">
        {blocks.map((b) => (
          <div key={b.key} className="rounded-xl bg-ocean-50 p-4 text-sm dark:bg-ocean-900/30">
            <p className="text-xs font-semibold text-ocean-700 dark:text-ocean-400">
              {b.kind === 'example' ? '例題' : `やさしい説明 ${b.level}`}
            </p>
            {b.status === 'error' ? (
              <p className="mt-2 text-red-600 dark:text-red-400">{b.message}</p>
            ) : (
              <p className="mt-2 leading-relaxed text-foreground/80 whitespace-pre-wrap">
                {b.text ? cleanExplanation(b.text) : <span className="text-foreground/50">AIが説明を作っています…</span>}
                {b.status === 'loading' && <span className="ml-0.5 animate-pulse">▌</span>}
              </p>
            )}
          </div>
        ))}
      </div>

      {blocks.length > 0 && (
        <p className="text-xs text-foreground/50">
          ※ 追加の説明はAIがその場で作っています。気になる点は、ハンズオンテキストでも確かめてみてください。
        </p>
      )}
    </div>
  )
}

function HelpButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-ocean-700 hover:border-ocean-400 hover:bg-ocean-50 disabled:pointer-events-none disabled:opacity-50 dark:border-white/15 dark:text-ocean-400 dark:hover:bg-ocean-900/30 transition-colors"
    >
      {children}
    </button>
  )
}
