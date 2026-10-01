'use client'

import Link from 'next/link'
import { startTransition, useEffect, useReducer, useRef, useState } from 'react'
import { HANDSON_PAGES } from '@/lib/handson/pages'
import { loadQuizHistory, recordQuizResult, type QuizHistoryEntry, type QuizPageScore } from '@/lib/quiz-history'
import type { QuizItem, QuizStreamEvent } from '@/lib/quiz/schema'

const CHOICE_LABELS = ['A', 'B', 'C', 'D']

// 問題はサーバーからストリーミングで1問ずつ届く。受講者は1問目が届いた時点で解き始め、
// 解いている間に残りが届く。生成が追いつかなければ「次の問題を作成中」で待つ。
type State = {
  view: 'intro' | 'running' | 'error' | 'result'
  runId: number // 「もう一度」のたびに増やす(履歴を1回だけ記録するため)
  message: string
  items: QuizItem[]
  planned: number // 予定の出題数(生成が一部失敗すると、実際の出題数 items.length はこれより少なくなる)
  done: boolean // サーバーからの問題がすべて届いた
  index: number
  answers: (number | null)[]
  waitingSince: number // 問題の到着待ちを始めた時刻(経過秒数の表示用)
}

type Action =
  | { type: 'start'; at: number }
  | { type: 'event'; event: QuizStreamEvent }
  | { type: 'fail'; message: string }
  | { type: 'answer'; choice: number }
  | { type: 'next'; at: number }

const initialState: State = {
  view: 'intro',
  runId: 0,
  message: '',
  items: [],
  planned: 0,
  done: false,
  index: 0,
  answers: [],
  waitingSince: 0,
}

// 生成が終わったときに、受講者が最後の問題の先で待っていれば結果画面へ進める。
function finishIfWaiting(state: State): State {
  return state.view === 'running' && state.done && state.index >= state.items.length ? { ...state, view: 'result' } : state
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { ...initialState, view: 'running', runId: state.runId + 1, waitingSince: action.at }
    case 'event': {
      if (state.view !== 'running') return state
      const e = action.event
      if (e.type === 'start') return { ...state, planned: e.total }
      if (e.type === 'question') return { ...state, items: [...state.items, e.item], answers: [...state.answers, null] }
      if (e.type === 'done') return finishIfWaiting({ ...state, done: true })
      // error: 1問も届いていなければエラー画面、届いていればそこまでの問題で続ける
      return state.items.length === 0
        ? { ...state, view: 'error', message: e.message }
        : finishIfWaiting({ ...state, done: true })
    }
    case 'fail':
      if (state.view !== 'running') return state
      return state.items.length === 0
        ? { ...state, view: 'error', message: action.message }
        : finishIfWaiting({ ...state, done: true })
    case 'answer': {
      if (state.view !== 'running' || state.answers[state.index] != null) return state
      const answers = [...state.answers]
      answers[state.index] = action.choice
      return { ...state, answers }
    }
    case 'next': {
      if (state.view !== 'running') return state
      return finishIfWaiting({ ...state, index: state.index + 1, waitingSince: action.at })
    }
  }
}

function scoreByPage(questions: QuizItem[], answers: number[]): QuizPageScore[] {
  return HANDSON_PAGES.map((page) => {
    const items = questions.map((q, i) => ({ q, a: answers[i] })).filter(({ q }) => q.pageId === page.id)
    return {
      pageId: page.id,
      title: page.title,
      correct: items.filter(({ q, a }) => q.answerIndex === a).length,
      total: items.length,
    }
  }).filter((p) => p.total > 0)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// /api/quiz の NDJSON を1行ずつ読み、イベントごとに onEvent を呼ぶ。
async function readQuizStream(res: Response, onEvent: (event: QuizStreamEvent) => void): Promise<void> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let pending = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pending += value
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as QuizStreamEvent)
    }
  }
}

export default function QuizPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [history, setHistory] = useState<QuizHistoryEntry[]>([])
  const [now, setNow] = useState(0)
  const [controller, setController] = useState<AbortController | null>(null)
  const current = state.items[state.index]
  const waiting = state.view === 'running' && !current

  useEffect(() => {
    startTransition(() => setHistory(loadQuizHistory()))
  }, [])

  // 画面を離れたら生成を打ち切る(サーバー側も順番待ち・生成を中断してスロットを空ける)
  useEffect(() => () => controller?.abort(), [controller])

  // 問題の到着待ちの経過秒数(待ち時間の目安として表示する)
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [waiting])
  const elapsed = Math.max(0, Math.floor((now - state.waitingSince) / 1000))

  // 結果画面に進んだら、成績を1回だけ履歴に記録する
  const recordedRunId = useRef(0)
  useEffect(() => {
    if (state.view !== 'result' || recordedRunId.current === state.runId) return
    recordedRunId.current = state.runId
    const answers = state.items.map((_, i) => state.answers[i] ?? -1)
    recordQuizResult({
      at: new Date().toISOString(),
      correct: state.items.filter((q, i) => q.answerIndex === answers[i]).length,
      total: state.items.length,
      pages: scoreByPage(state.items, answers),
    })
  }, [state])

  async function startQuiz() {
    const ac = new AbortController()
    setController(ac)
    const at = Date.now()
    setNow(at)
    dispatch({ type: 'start', at })
    try {
      const res = await fetch('/api/quiz', { method: 'POST', signal: ac.signal })
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        dispatch({ type: 'fail', message: data?.error ?? '問題の生成に失敗しました。もう一度お試しください。' })
        return
      }
      await readQuizStream(res, (event) => dispatch({ type: 'event', event }))
      // done/error を受け取らずに切れた場合(サーバー停止など)も、届いた分で終える
      dispatch({ type: 'fail', message: '問題の生成が途中で止まりました。もう一度お試しください。' })
    } catch {
      if (ac.signal.aborted) return
      dispatch({ type: 'fail', message: 'サーバーに接続できませんでした。もう一度お試しください。' })
    }
  }

  const total = state.done ? state.items.length : state.planned || state.items.length

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex items-start gap-3">
          <Link
            href="/"
            title="チャット画面に戻る"
            aria-label="チャット画面に戻る"
            className="mt-0.5 shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold">確認テスト</h1>
            <p className="mt-1 text-xs text-foreground/50">
              ハンズオンテキスト（{HANDSON_PAGES.map((p) => p.title).join('・')}）の内容から、AIが毎回新しい問題を作ります。
            </p>
          </div>
        </div>

        {state.view === 'intro' && <Intro history={history} onStart={startQuiz} />}

        {waiting && (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-black/10 p-10 text-center dark:border-white/15">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ocean-200 border-t-ocean-700" />
            {state.index === 0 ? (
              <>
                <p className="text-sm font-medium">AIが問題を作っています…</p>
                <p className="text-xs text-foreground/50">
                  最初の問題ができしだい始まります（経過 {elapsed}秒）。残りの問題は、解いている間にAIが作り続けます。混み合っているときは順番待ちになります。
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">
                  第{state.index + 1}問をAIが作っています…
                </p>
                <p className="text-xs text-foreground/50">もうしばらくお待ちください（経過 {elapsed}秒）。</p>
              </>
            )}
          </div>
        )}

        {state.view === 'error' && (
          <div className="flex flex-col items-start gap-4 rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/60 dark:bg-red-950/30">
            <p className="text-sm text-red-700 dark:text-red-300">{state.message}</p>
            <PrimaryButton onClick={startQuiz}>もう一度試す</PrimaryButton>
          </div>
        )}

        {state.view === 'running' && current && (
          <QuestionCard
            item={current}
            index={state.index}
            total={total}
            selected={state.answers[state.index]}
            onAnswer={(choice) => dispatch({ type: 'answer', choice })}
            onNext={() => dispatch({ type: 'next', at: Date.now() })}
          />
        )}

        {state.view === 'result' && (
          <Result
            questions={state.items}
            answers={state.items.map((_, i) => state.answers[i] ?? -1)}
            planned={state.planned}
            onRetry={startQuiz}
          />
        )}
      </div>
    </div>
  )
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl bg-ocean-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ocean-800 transition-colors"
    >
      {children}
    </button>
  )
}

function Intro({ history, onStart }: { history: QuizHistoryEntry[]; onStart: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-4 rounded-xl border border-black/10 p-6 dark:border-white/15">
        <ul className="list-disc pl-5 text-sm text-foreground/70 space-y-1">
          <li>4択問題が10問出題されます。1問ずつ答えると、すぐに正解と解説が表示されます。</li>
          <li>問題はAIがその場で作るため、受けるたびに内容が変わります。何度でも挑戦できます。</li>
          <li>結果はこのブラウザにだけ記録されます（講師やサーバーには送られません）。</li>
        </ul>
        <p className="text-xs text-foreground/50">
          ※ AIが作った問題なので、まれに不自然な問題や誤りが含まれることがあります。気づいたら、それも「AIの回答をうのみにしない」練習だと思って、テキストで確かめてみてください。
        </p>
        <div>
          <PrimaryButton onClick={onStart}>テストを始める</PrimaryButton>
        </div>
      </div>

      {history.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">これまでの成績</h2>
          <ul className="flex flex-col divide-y divide-black/10 rounded-xl border border-black/10 dark:divide-white/15 dark:border-white/15">
            {history.map((h) => (
              <li key={h.at} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="w-24 text-foreground/50 tabular-nums">{formatDate(h.at)}</span>
                <span className="font-semibold tabular-nums">
                  {h.correct} / {h.total}問
                </span>
                <span className="text-xs text-foreground/50">
                  {h.pages.map((p) => `${p.title} ${p.correct}/${p.total}`).join('　')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function QuestionCard({
  item,
  index,
  total,
  selected,
  onAnswer,
  onNext,
}: {
  item: QuizItem
  index: number
  total: number
  selected: number | null
  onAnswer: (choice: number) => void
  onNext: () => void
}) {
  const answered = selected != null
  const correct = selected === item.answerIndex
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-black/10 p-6 dark:border-white/15">
      <div className="flex items-center justify-between gap-3 text-xs text-foreground/50">
        <span className="font-semibold text-ocean-700 dark:text-ocean-400 tabular-nums">
          第{index + 1}問 / {total}
        </span>
        <span>
          {item.pageTitle}　{item.chapter}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <div className="h-full bg-ocean-500 transition-all" style={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }} />
      </div>
      <p className="text-base font-medium leading-relaxed whitespace-pre-wrap">{item.question}</p>

      <div className="flex flex-col gap-2">
        {item.choices.map((choice, i) => {
          const isAnswer = i === item.answerIndex
          const isSelected = i === selected
          const style = !answered
            ? 'border-black/10 hover:border-ocean-400 hover:bg-ocean-50 dark:border-white/15 dark:hover:bg-ocean-900/30'
            : isAnswer
              ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
              : isSelected
                ? 'border-red-400 bg-red-50 dark:bg-red-950/30'
                : 'border-black/10 opacity-60 dark:border-white/15'
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => onAnswer(i)}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${style}`}
            >
              <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border border-current text-[11px] font-semibold">
                {CHOICE_LABELS[i]}
              </span>
              <span className="flex-1">{choice}</span>
              {answered && isAnswer && <span className="text-xs font-semibold text-green-700 dark:text-green-400">正解</span>}
              {answered && isSelected && !isAnswer && <span className="text-xs font-semibold text-red-600 dark:text-red-400">あなたの回答</span>}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className="flex flex-col gap-4">
          <div className={`rounded-xl p-4 text-sm ${correct ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
            <p className={`font-semibold ${correct ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {correct ? '正解です！' : `不正解… 正解は ${CHOICE_LABELS[item.answerIndex]} です`}
            </p>
            <p className="mt-2 leading-relaxed text-foreground/80 whitespace-pre-wrap">{item.explanation}</p>
          </div>
          <div className="flex justify-end">
            <PrimaryButton onClick={onNext}>{index + 1 < total ? '次の問題へ' : '結果を見る'}</PrimaryButton>
          </div>
        </div>
      )}
    </div>
  )
}

function Result({
  questions,
  answers,
  planned,
  onRetry,
}: {
  questions: QuizItem[]
  answers: number[]
  planned: number
  onRetry: () => void
}) {
  const total = questions.length
  const correct = questions.filter((q, i) => q.answerIndex === answers[i]).length
  const pages = scoreByPage(questions, answers)
  const message =
    correct === total
      ? '全問正解です！ハンズオンの内容がしっかり身についています。'
      : correct >= total * 0.7
        ? 'よくできました。間違えた問題の解説を読んで、テキストを見直しておきましょう。'
        : '間違えた問題の章を、ハンズオンテキストでもう一度確認してみましょう。'

  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-black/10 p-8 text-center dark:border-white/15">
        <p className="text-sm text-foreground/60">あなたの結果</p>
        <p className="text-4xl font-bold tabular-nums">
          {correct}
          <span className="text-xl font-semibold text-foreground/50"> / {total}問</span>
        </p>
        <p className="text-sm text-foreground/70">{message}</p>
        {total < planned && (
          <p className="text-xs text-foreground/50">
            AIによる問題の生成が一部うまくいかなかったため、{planned}問のうち作れた{total}問で採点しています。
          </p>
        )}
        <div className="mt-2 grid w-full gap-3 sm:grid-cols-3">
          {pages.map((p) => (
            <div key={p.pageId} className="rounded-xl bg-black/[0.03] px-4 py-3 dark:bg-white/5">
              <p className="text-xs text-foreground/60">{p.title}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {p.correct} / {p.total}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          <PrimaryButton onClick={onRetry}>新しい問題でもう一度</PrimaryButton>
          <Link
            href="/"
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            チャット画面に戻る
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">ふりかえり</h2>
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => {
            const ok = q.answerIndex === answers[i]
            return (
              <li key={i} className="rounded-xl border border-black/10 p-4 text-sm dark:border-white/15">
                <div className="flex items-start gap-2">
                  <span className={`flex-none font-semibold ${ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {ok ? '○' : '×'}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <p className="font-medium whitespace-pre-wrap">
                      第{i + 1}問　{q.question}
                    </p>
                    <p className="text-foreground/70">
                      正解：{q.choices[q.answerIndex]}
                      {!ok && answers[i] >= 0 && <span className="text-red-600 dark:text-red-400">（あなたの回答：{q.choices[answers[i]]}）</span>}
                    </p>
                    <p className="text-xs text-foreground/60 whitespace-pre-wrap">{q.explanation}</p>
                    <p className="text-xs text-foreground/40">
                      {q.pageTitle}　{q.chapter}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </>
  )
}
