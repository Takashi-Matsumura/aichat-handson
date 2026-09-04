'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCjkFriendly from 'remark-cjk-friendly'
import rehypeKatex from 'rehype-katex'
import { publicDocumentList } from '@/lib/lab/injection-documents'

const DOCUMENTS = publicDocumentList()

const MASK_SAMPLE = `田中花子（tanaka@example.co.jp / 090-1234-5678）宛にご案内します。
決済用カード番号: 4111 1111 1111 1111
社内システム: https://sales.internal.example.co.jp/dashboard
API_KEY=sk_live_abcdef1234567890ABCDEF
password: Sup3rSecret!`

type ToolEvent = { id: string; phase: 'start' | 'result'; summary?: string }
type MaskMatch = { rule: string; count: number }

const RULE_LABELS: Record<string, string> = {
  EMAIL: 'メールアドレス',
  CREDIT_CARD: 'カード番号',
  PHONE: '電話番号',
  API_KEY: 'APIキー',
  PASSWORD: 'パスワード',
  INTERNAL_URL: '社内URL',
}

function MarkdownBlock({ content }: { content: string | null }) {
  if (!content) {
    return <p className="text-sm text-gray-400 dark:text-zinc-500 animate-pulse">読み込み中...</p>
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkCjkFriendly]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default function SecurityLabPage() {
  const [injectionDoc, setInjectionDoc] = useState<string | null>(null)
  const [maskingDoc, setMaskingDoc] = useState<string | null>(null)

  useEffect(() => {
    fetch('/security-lab/injection.md').then((r) => r.text()).then(setInjectionDoc)
    fetch('/security-lab/masking.md').then((r) => r.text()).then(setMaskingDoc)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 px-6 py-10">
      <div className="mx-auto max-w-3xl flex flex-col gap-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-zinc-100">セキュリティ実験ラボ</h1>
            <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
              「AIとセキュリティ」の発展編。実際に手を動かして、攻撃と防御を体験します。
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 flex items-center gap-1.5 text-sm text-gray-400 dark:text-zinc-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            チャット画面に戻る
          </Link>
        </div>

        <section className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-2xl p-6 flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100">
            間接プロンプト・インジェクション体験
          </h2>
          <MarkdownBlock content={injectionDoc} />
          <InjectionDemo />
        </section>

        <section className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-2xl p-6 flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-100">
            マスキング可視化ラボ
          </h2>
          <MarkdownBlock content={maskingDoc} />
          <MaskingDemo />
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 間接プロンプト・インジェクション体験
// ---------------------------------------------------------------------------

function InjectionDemo() {
  const [docId, setDocId] = useState(DOCUMENTS[0]?.id ?? '')
  const [defenseOn, setDefenseOn] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [content, setContent] = useState('')
  const [leaked, setLeaked] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const selectedDoc = DOCUMENTS.find((d) => d.id === docId)

  async function run() {
    if (loading || !docId) return
    setLoading(true)
    setError(null)
    setToolEvents([])
    setContent('')
    setLeaked(null)

    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/lab/injection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId, defenseOn }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'エラーが発生しました')
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('ストリームを取得できませんでした')
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          let parsed: {
            error?: string
            choices?: { delta?: { content?: string } }[]
            tool_event?: { phase: 'start' | 'result'; id: string; summary?: string }
            lab_result?: { leaked: boolean }
          }
          try {
            parsed = JSON.parse(payload)
          } catch {
            continue
          }
          if (parsed.error) throw new Error(parsed.error)
          if (parsed.tool_event) {
            const ev = parsed.tool_event
            setToolEvents((prev) => {
              const idx = prev.findIndex((e) => e.id === ev.id)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = { ...next[idx], phase: ev.phase, summary: ev.summary }
                return next
              }
              return [...prev, { id: ev.id, phase: ev.phase, summary: ev.summary }]
            })
          }
          const chunk = parsed.choices?.[0]?.delta?.content ?? ''
          if (chunk) setContent((prev) => prev + chunk)
          if (parsed.lab_result) setLeaked(parsed.lab_result.leaked)
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {DOCUMENTS.map((doc) => (
          <label
            key={doc.id}
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
              docId === doc.id
                ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/20'
                : 'border-gray-200 dark:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-700/50'
            }`}
          >
            <input
              type="radio"
              name="injection-doc"
              className="mt-1"
              checked={docId === doc.id}
              onChange={() => setDocId(doc.id)}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-gray-800 dark:text-zinc-100">{doc.title}</span>
              <span className="text-xs text-gray-500 dark:text-zinc-400">{doc.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setDefenseOn((v) => !v)}
          aria-pressed={defenseOn}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
            defenseOn
              ? 'border-emerald-400 bg-emerald-50 text-emerald-600 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-zinc-400'
          }`}
        >
          防御プロンプト: {defenseOn ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="flex-none px-4 py-1.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '実行中...' : 'AIに要約させる'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
      )}

      {(toolEvents.length > 0 || content) && (
        <div className="flex flex-col gap-2">
          {toolEvents.length > 0 && (
            <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-900/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-400">
              {toolEvents.map((ev) => (
                <div key={ev.id}>
                  📄 {ev.phase === 'start' ? '文書を読み込んでいます...' : '文書を読み込みました'}
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/40 px-4 py-3 text-sm prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkCjkFriendly]}>{content || (loading ? '…' : '')}</ReactMarkdown>
          </div>
          {leaked !== null && (
            <div
              className={`text-xs font-medium rounded-lg px-3 py-2 ${
                leaked
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              }`}
            >
              {leaked
                ? '🚨 インジェクションに成功しました：AIが本来の指示を無視し、文書内に隠された命令に従いました。'
                : selectedDoc?.hasInjection
                  ? '✅ 影響なし：AIは隠された指示に従わず、要約だけを行いました。'
                  : 'ℹ️ この文書には仕込まれた指示はありません（基準としての比較用です）。'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// マスキング可視化ラボ
// ---------------------------------------------------------------------------

function MaskingDemo() {
  const [text, setText] = useState('')
  const [masked, setMasked] = useState('')
  const [matches, setMatches] = useState<MaskMatch[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!text.trim()) {
      setMasked('')
      setMatches([])
      return
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/lab/mask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const data = await res.json()
        setMasked(data.masked ?? '')
        setMatches(data.matches ?? [])
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [text])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setText(MASK_SAMPLE)}
          className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-zinc-600 text-xs font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
        >
          サンプル文を入力
        </button>
        <button
          type="button"
          onClick={() => setText('')}
          className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-zinc-600 text-xs font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
        >
          クリア
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="氏名・メールアドレス・電話番号・カード番号などを含む文章を入力してみてください"
        rows={5}
        className="w-full resize-none rounded-xl border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-4 py-2.5 text-sm text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      {(masked || loading) && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">ログ保存前のマスキング結果</span>
          <pre className="whitespace-pre-wrap break-all rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/40 px-4 py-3 text-sm text-gray-800 dark:text-zinc-100">
            {masked}
          </pre>
          {matches.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {matches.map((m) => (
                <span
                  key={m.rule}
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                >
                  {RULE_LABELS[m.rule] ?? m.rule} × {m.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-zinc-500 leading-relaxed">
        ⚠️ このマスキングは、利用状況ログを保存する直前にのみ適用される「事後の安全網」です。
        AIへ実際に送信されるメッセージそのものが伏せ字になるわけではありません。
        入力時点で情報を伏せる習慣のほうが本質的な対策です。
      </p>
    </div>
  )
}
