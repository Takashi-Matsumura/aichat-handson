'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCjkFriendly from 'remark-cjk-friendly'
import rehypeKatex from 'rehype-katex'
import Link from 'next/link'
import HandsonPanel from './components/HandsonPanel'

type ModelInfo = { model: string | null; label: string | null; online: boolean; ctxSize: number | null }

type Token = { id: number; piece: string }

type ToolEvent = {
  id: string
  name: 'web_search' | 'open_url'
  phase: 'start' | 'result'
  query?: string
  url?: string
  summary?: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  thinkingEnabled?: boolean
  rawThinking?: string
  thinking?: string
  thinkingDone?: boolean
  showThinking?: boolean
  tokens?: Token[]
  showTokens?: boolean
  toolEvents?: ToolEvent[]
  showTools?: boolean
  versions?: string[]
  displayVersionIdx?: number
}

type ChatStreamPayload = {
  choices?: { delta?: { content?: string } }[]
  error?: string
  tool_event?: {
    phase: 'start' | 'result'
    id: string
    name: 'web_search' | 'open_url'
    args?: { query?: string; url?: string }
    summary?: string
  }
}

const TOKEN_COLORS = [
  'bg-rose-100 dark:bg-rose-900/40',
  'bg-amber-100 dark:bg-amber-900/40',
  'bg-lime-100 dark:bg-lime-900/40',
  'bg-sky-100 dark:bg-sky-900/40',
  'bg-violet-100 dark:bg-violet-900/40',
  'bg-orange-100 dark:bg-orange-900/40',
]

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelMounted, setPanelMounted] = useState(false)
  const [panelFull, setPanelFull] = useState(false)
  const [thinking, setThinking] = useState(false)
  // Web検索（tool calling）はハンズオン5ページ目を開いているときだけ有効
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [selectedModel, setSelectedModel] = useState<1 | 2>(1)
  const [modelInfos, setModelInfos] = useState<Record<1 | 2, ModelInfo>>({
    1: { model: null, label: null, online: false, ctxSize: null },
    2: { model: null, label: null, online: false, ctxSize: null },
  })
  const [usedTokens, setUsedTokens] = useState(0)
  const tokenizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const wasLoadingRef = useRef(false)
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // loading が true → false に変わったとき（AI回答完了）に入力欄へフォーカス
  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      inputRef.current?.focus()
    }
    wasLoadingRef.current = loading
  }, [loading])

  // メッセージ更新後（ローディング完了時）にコンテキスト使用トークン数を計算
  useEffect(() => {
    if (loading) return
    if (tokenizeTimerRef.current) clearTimeout(tokenizeTimerRef.current)
    if (messages.length === 0) { setUsedTokens(0); return }
    tokenizeTimerRef.current = setTimeout(async () => {
      const allContent = messages.map((m) => m.content).join('\n\n')
      if (!allContent.trim()) { setUsedTokens(0); return }
      try {
        const res = await fetch('/api/tokenize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: allContent, modelIndex: selectedModel }),
        })
        const data = await res.json()
        if (data.tokens) setUsedTokens(data.tokens.length)
      } catch { /* ignore */ }
    }, 500)
    return () => { if (tokenizeTimerRef.current) clearTimeout(tokenizeTimerRef.current) }
  }, [messages, loading, selectedModel])

  useEffect(() => {
    setPanelOpen(localStorage.getItem('handson-panel-open') === 'true')
    setThinking(localStorage.getItem('thinking-mode') === 'true')
    const saved = localStorage.getItem('selected-model')
    if (saved === '2') setSelectedModel(2)
    setPanelMounted(true)

    async function fetchModelInfo(n: 1 | 2) {
      try {
        const res = await fetch(`/api/model-info?n=${n}`)
        const data = await res.json()
        setModelInfos((prev) => ({
          ...prev,
          [n]: { model: data.model, label: data.label ?? null, online: data.model !== null, ctxSize: data.ctxSize ?? null },
        }))
      } catch {
        // オフラインのままにする
      }
    }
    fetchModelInfo(1)
    fetchModelInfo(2)
  }, [])

  function switchModel(n: 1 | 2) {
    // 生成中にモデルを切り替えると、進行中のリクエストがバックグラウンドに取り残され、
    // 応答が届いても表示先のメッセージが既に消えているため画面に反映されない。
    // 切り替え前に必ず中断してから messages をクリアする。
    abortControllerRef.current?.abort()
    setLoading(false)
    setStreamingIndex(null)
    setSelectedModel(n)
    localStorage.setItem('selected-model', String(n))
    setMessages([])
    setError(null)
    if (n === 2) {
      setThinking(false)
      localStorage.setItem('thinking-mode', 'false')
    }
  }

  function shortModelName(info: ModelInfo, n: 1 | 2): string {
    if (info.label) return info.label
    if (!info.model) return `モデル ${n}`
    const base = info.model.replace(/\.gguf$/i, '').replace(/[_]/g, '-')
    const parts = base.split('-')
    return parts.slice(0, 3).join('-')
  }

  function togglePanel() {
    setPanelOpen((prev) => {
      const next = !prev
      localStorage.setItem('handson-panel-open', String(next))
      // 開くときは必ず画面半分の状態で開く
      if (next) setPanelFull(false)
      return next
    })
  }

  function toggleThinking() {
    setThinking((prev) => {
      localStorage.setItem('thinking-mode', String(!prev))
      return !prev
    })
  }

  async function handleTokenToggle(index: number, content: string, hasTokens: boolean) {
    if (hasTokens) {
      setMessages(prev => prev.map((m, j) =>
        j === index ? { ...m, showTokens: !m.showTokens } : m
      ))
      return
    }
    try {
      const res = await fetch('/api/tokenize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, modelIndex: selectedModel }),
      })
      const data = await res.json()
      if (data.tokens) {
        setMessages(prev => prev.map((m, j) =>
          j === index ? { ...m, tokens: data.tokens, showTokens: true } : m
        ))
      }
    } catch { /* ignore */ }
  }

  function handleClearChat() {
    abortControllerRef.current?.abort()
    setMessages([])
    setInput('')
    setError(null)
    setLoading(false)
    setUsedTokens(0)
    inputRef.current?.focus()
  }

  async function streamInto(
    targetIndex: number,
    historyMessages: { role: string; content: string }[],
    useThink: boolean,
    useWebSearch: boolean,
    modelIdx: 1 | 2,
  ) {
    const update = (updater: (msg: Message) => Message) =>
      setMessages(prev => {
        const msg = prev[targetIndex]
        if (!msg) return prev
        return [...prev.slice(0, targetIndex), updater(msg), ...prev.slice(targetIndex + 1)]
      })

    abortControllerRef.current = new AbortController()
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: historyMessages, thinking: useThink, webSearch: useWebSearch, modelIndex: modelIdx }),
      signal: abortControllerRef.current.signal,
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error ?? 'エラーが発生しました')
    }

    const reader = response.body?.getReader()
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

        let parsed: ChatStreamPayload
        try { parsed = JSON.parse(payload) } catch { continue }

        if (parsed.error) throw new Error(parsed.error)

        if (parsed.tool_event) {
          const ev = parsed.tool_event
          update(msg => {
            const events = msg.toolEvents ? [...msg.toolEvents] : []
            if (ev.phase === 'start') {
              events.push({ id: ev.id, name: ev.name, phase: 'start', query: ev.args?.query, url: ev.args?.url })
            } else {
              const idx = events.findIndex((e) => e.id === ev.id)
              if (idx >= 0) events[idx] = { ...events[idx], phase: 'result', summary: ev.summary }
              else events.push({ id: ev.id, name: ev.name, phase: 'result', summary: ev.summary })
            }
            return { ...msg, toolEvents: events, showTools: true }
          })
          continue
        }

        const chunk = parsed.choices?.[0]?.delta?.content ?? ''
        if (chunk) {
          update(msg => {
            if (!msg.thinkingEnabled || msg.thinkingDone) {
              return { ...msg, content: msg.content + chunk }
            }
            const rawAcc = (msg.rawThinking ?? '') + chunk
            const closeIdx = rawAcc.indexOf('</think>')
            if (closeIdx !== -1) {
              const rawThinking = rawAcc.slice(0, closeIdx)
              const cleanThinking = rawThinking.replace(/^<think>\n?/, '')
              const afterThink = rawAcc.slice(closeIdx + 8).trimStart()
              return { ...msg, rawThinking: rawAcc, thinking: cleanThinking, thinkingDone: true, showThinking: true, content: afterThink }
            }
            const cleanThinking = rawAcc.replace(/^<think>\n?/, '')
            return { ...msg, rawThinking: rawAcc, thinking: cleanThinking, thinkingDone: false, content: '' }
          })
        }
      }
    }

    update(msg => {
      if (msg.thinkingEnabled && !msg.thinkingDone && msg.rawThinking) {
        return { ...msg, thinkingDone: true, content: msg.rawThinking.replace(/^<think>\n?/, ''), thinking: undefined }
      }
      return msg
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setError(null)
    const useThink = thinking && !webSearchEnabled
    const userMessage: Message = { role: 'user', content: text }
    const history = [...messages, userMessage]
    const targetIndex = history.length
    setMessages([...history, { role: 'assistant', content: '', thinkingEnabled: useThink }])
    setInput('')
    setLoading(true)
    setStreamingIndex(targetIndex)

    try {
      await streamInto(
        targetIndex,
        history.map(m => ({ role: m.role, content: m.content })),
        useThink,
        webSearchEnabled,
        selectedModel,
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
      setStreamingIndex(null)
    }
  }

  async function handleRegenerate(index: number) {
    if (loading) return
    const msg = messages[index]
    if (msg.role !== 'assistant') return

    setError(null)
    const useThink = thinking && !webSearchEnabled
    const prevVersions = [...(msg.versions ?? []), msg.content]

    setMessages(prev => prev.map((m, j) =>
      j !== index ? m : {
        ...m,
        content: '',
        thinkingEnabled: useThink,
        thinkingDone: undefined,
        rawThinking: undefined,
        thinking: undefined,
        showThinking: undefined,
        tokens: undefined,
        showTokens: undefined,
        toolEvents: undefined,
        showTools: undefined,
        versions: prevVersions,
        displayVersionIdx: undefined,
      }
    ))
    setLoading(true)
    setStreamingIndex(index)

    try {
      await streamInto(
        index,
        messages.slice(0, index).map(m => ({ role: m.role, content: m.content })),
        useThink,
        webSearchEnabled,
        selectedModel,
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      setMessages(prev => prev.map((m, j) =>
        j !== index ? m : { ...m, content: prevVersions[prevVersions.length - 1], versions: msg.versions, displayVersionIdx: undefined }
      ))
    } finally {
      setLoading(false)
      setStreamingIndex(null)
    }
  }

  function handleVersionNav(index: number, delta: number) {
    setMessages(prev => prev.map((m, j) => {
      if (j !== index || !m.versions) return m
      const total = m.versions.length + 1
      const current = m.displayVersionIdx ?? (total - 1)
      const next = Math.max(0, Math.min(total - 1, current + delta))
      return { ...m, displayVersionIdx: next === total - 1 ? undefined : next, showTokens: false }
    }))
  }

  function handleDelete(index: number) {
    setMessages(prev => prev.map((m, j) => {
      if (j !== index || !m.versions || m.versions.length === 0) return m

      if (m.displayVersionIdx !== undefined) {
        // 過去バージョンを削除
        const idx = m.displayVersionIdx
        const newVersions = [...m.versions.slice(0, idx), ...m.versions.slice(idx + 1)]
        const newDisplayIdx = newVersions.length === 0
          ? undefined
          : idx > 0 ? idx - 1 : 0
        return {
          ...m,
          versions: newVersions.length > 0 ? newVersions : undefined,
          displayVersionIdx: newDisplayIdx,
          showTokens: false,
        }
      } else {
        // 最新版（content）を削除 → ひとつ前を最新に昇格
        const newVersions = m.versions.slice(0, -1)
        return {
          ...m,
          content: m.versions[m.versions.length - 1],
          versions: newVersions.length > 0 ? newVersions : undefined,
          displayVersionIdx: undefined,
          tokens: undefined,
          showTokens: false,
        }
      }
    }))
  }

  function hostOf(url?: string) {
    if (!url) return 'ページ'
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  function toolLabel(ev: ToolEvent) {
    if (ev.name === 'web_search') {
      const q = ev.query ? `「${ev.query}」` : ''
      return ev.phase === 'start' ? `${q}を検索中` : `${q}を検索しました`
    }
    return ev.phase === 'start' ? `${hostOf(ev.url)} を開いています` : `${hostOf(ev.url)} を読みました`
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-zinc-900">
      <header className="flex-none bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500 flex-none">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            <circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none" />
          </svg>
          <h1 className="text-base font-semibold text-gray-800 dark:text-zinc-100">
            AI チャット
          </h1>
          <span className="hidden sm:block text-gray-300 dark:text-zinc-600 select-none">|</span>
          <p className="hidden sm:block text-xs text-gray-400 dark:text-zinc-500">
            Powered by llama.cpp + Gemma
          </p>
        </div>
        {/* モデル選択（パネルを閉じているときは手動切替可、開いているときはページに応じて自動切替） */}
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 dark:border-zinc-600 p-0.5">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { if (!panelOpen) switchModel(n) }}
              title={
                panelOpen
                  ? 'ハンズオンページに応じて自動切替'
                  : (modelInfos[n].model ?? `ポート ${n === 1 ? 8080 : 8081}`)
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedModel === n
                  ? 'bg-indigo-500 text-white'
                  : panelOpen
                    ? 'text-gray-500 dark:text-zinc-400 cursor-default'
                    : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-none ${
                  modelInfos[n].online ? 'bg-green-400' : 'bg-gray-300 dark:bg-zinc-600'
                }`}
              />
              {shortModelName(modelInfos[n], n)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* AI利用状況ダッシュボードへのリンク */}
          <Link
            href="/analytics"
            title="AI利用状況ダッシュボード"
            aria-label="AI利用状況ダッシュボード"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </Link>
          {/* セキュリティ実験ラボへのリンク */}
          <Link
            href="/security-lab"
            title="セキュリティ実験ラボ"
            aria-label="セキュリティ実験ラボ"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5Z" />
              <path d="M9.5 12 11 13.5 15 9.5" />
            </svg>
          </Link>
          {/* 受講者向けURL共有ページへのリンク */}
          <Link
            href="/presenter"
            title="受講者向けURL共有"
            aria-label="受講者向けURL共有"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3h-3z" />
              <path d="M17 17h3v3h-3z" />
            </svg>
          </Link>
          {panelMounted && (
            <button
              onClick={togglePanel}
              title={panelOpen ? 'テキストを閉じる' : 'テキストを開く'}
              aria-label={panelOpen ? 'テキストを閉じる' : 'テキストを開く'}
              className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
                panelOpen
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-500 dark:border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-400'
                  : 'border-gray-200 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400 dark:text-zinc-500 text-sm">
                  メッセージを送信してAIと会話を始めてください
                </p>
              </div>
            )}
            {messages.map((msg, i) => {
              const displayedContent = msg.displayVersionIdx !== undefined && msg.versions
                ? msg.versions[msg.displayVersionIdx]
                : msg.content
              return (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-none w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1">
                    AI
                  </div>
                )}
                <div className="max-w-[90%] sm:max-w-[75%] flex flex-col gap-1">
                  {/* 思考プロセス表示 */}
                  {msg.role === 'assistant' && (msg.thinking !== undefined || (msg.thinkingEnabled && !msg.thinkingDone && msg.content === '')) && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden text-sm">
                      <button
                        type="button"
                        onClick={() => setMessages(prev => prev.map((m, j) =>
                          j === i ? { ...m, showThinking: !m.showThinking } : m
                        ))}
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
                          >
                            {msg.thinking}
                          </ReactMarkdown>
                          {!msg.thinkingDone && <span className="animate-pulse">▌</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ツール実行（Web検索・ページ取得）表示 */}
                  {msg.role === 'assistant' && msg.toolEvents && msg.toolEvents.length > 0 && (
                    <div className="rounded-xl border border-sky-200 dark:border-sky-800 overflow-hidden text-sm">
                      <button
                        type="button"
                        onClick={() => setMessages(prev => prev.map((m, j) =>
                          j === i ? { ...m, showTools: !m.showTools } : m
                        ))}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M2 12h20" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        {msg.toolEvents.some((e) => e.phase === 'start') ? (
                          <span className="animate-pulse">Webで調べています...</span>
                        ) : (
                          <span>Web検索の経過</span>
                        )}
                        <svg
                          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`ml-auto transition-transform ${msg.showTools ? 'rotate-180' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {msg.showTools && (
                        <div className="px-3 py-2 bg-sky-50/60 dark:bg-sky-900/10 border-t border-sky-200 dark:border-sky-800 space-y-2 max-h-56 overflow-y-auto">
                          {msg.toolEvents.map((ev, k) => (
                            <div key={`${ev.id}-${k}`} className="text-xs">
                              <div className="flex items-center gap-1.5 font-medium text-sky-800 dark:text-sky-300">
                                <span>{ev.name === 'web_search' ? '🔍' : '📄'}</span>
                                <span className="break-all">{toolLabel(ev)}</span>
                                {ev.phase === 'start' && <span className="animate-pulse">…</span>}
                              </div>
                              {ev.summary && (
                                <p className="mt-0.5 pl-5 text-sky-700/80 dark:text-sky-400/70 break-all line-clamp-3">
                                  {ev.summary}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* メッセージ本体 */}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                      msg.role === 'user'
                        ? 'bg-indigo-500 text-white rounded-tr-sm whitespace-pre-wrap'
                        : 'bg-white dark:bg-zinc-800 text-gray-800 dark:text-zinc-100 border border-gray-200 dark:border-zinc-700 rounded-tl-sm prose prose-sm dark:prose-invert max-w-none'
                    }`}
                  >
                    {msg.content === '' && msg.role === 'assistant' ? (
                      <span className="flex gap-1 py-0.5">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </span>
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
                              >
                                {displayedContent}
                              </ReactMarkdown>
                            )}
                            {!(loading && i === streamingIndex) && msg.content && (
                              <div className="not-prose flex items-center justify-between mt-1 gap-2">
                                {/* 再生成ボタン */}
                                <button
                                  type="button"
                                  onClick={() => handleRegenerate(i)}
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
                                      onClick={() => handleVersionNav(i, -1)}
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
                                      onClick={() => handleVersionNav(i, 1)}
                                      disabled={msg.displayVersionIdx === undefined}
                                      title="次のバージョン"
                                      className="w-5 h-5 flex items-center justify-center rounded hover:text-gray-600 dark:hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base leading-none"
                                    >
                                      ›
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(i)}
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
                                  onClick={() => handleTokenToggle(i, msg.content, !!msg.tokens)}
                                  disabled={msg.displayVersionIdx !== undefined}
                                  title={msg.showTokens ? 'マークダウン表示に戻す' : 'トークン単位で表示'}
                                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${
                                    msg.showTokens
                                      ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400'
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
                </div>
              </div>
              )
            })}
            {error && (
              <div className="flex justify-center">
                <p className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">
                  {error}
                </p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex-none bg-white dark:bg-zinc-800 border-t border-gray-200 dark:border-zinc-700 px-3 pt-2 pb-3"
          >
            {/* コンテキストウィンドウ使用量 */}
            {(() => {
              const ctxSize = modelInfos[selectedModel].ctxSize
              if (!ctxSize) return null
              const pct = Math.min((usedTokens / ctxSize) * 100, 100)
              return (
                <div className="mb-2 flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
                  <span className="flex-none">コンテキスト</span>
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-amber-400' : 'bg-indigo-300 dark:bg-indigo-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="flex-none tabular-nums">
                    {usedTokens.toLocaleString()} / {ctxSize.toLocaleString()}
                  </span>
                </div>
              )
            })()}
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleClearChat}
                title="新規チャット"
                className="flex-none w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
              {/* 推論モードトグル */}
              <button
                type="button"
                onClick={toggleThinking}
                disabled={selectedModel === 2}
                title={selectedModel === 2 ? 'このモデルは推論モード非対応' : thinking ? '推論モード ON（クリックでOFF）' : '推論モード OFF（クリックでON）'}
                aria-pressed={thinking}
                className={`flex-none w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
                  selectedModel === 2
                    ? 'border-gray-100 dark:border-zinc-700 text-gray-300 dark:text-zinc-700 cursor-not-allowed'
                    : thinking
                    ? 'border-amber-400 bg-amber-50 text-amber-500 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'border-gray-200 dark:border-zinc-600 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                  <path d="M9 18h6"/>
                  <path d="M10 22h4"/>
                </svg>
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力（Enterで送信、Shift+Enterで改行）"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-700 px-4 py-2.5 text-base md:text-sm text-gray-800 dark:text-zinc-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50 max-h-32 overflow-y-auto"
                style={{ fieldSizing: 'content' } as React.CSSProperties}
              />
              {/* Web検索トグル（パネルを閉じているときは手動ON/OFF可、開いているときはページ5連動） */}
              <button
                type="button"
                onClick={() => { if (!panelOpen) setWebSearchEnabled(prev => !prev) }}
                aria-pressed={webSearchEnabled}
                title={
                  panelOpen
                    ? (webSearchEnabled
                        ? 'Web検索 ON：AIとWeb検索ページで有効'
                        : 'Web検索 OFF：AIとWeb検索ページを開くと有効')
                    : (webSearchEnabled ? 'Web検索 ON（クリックでOFF）' : 'Web検索 OFF（クリックでON）')
                }
                className={`flex-none h-9 flex items-center gap-1 px-2 rounded-xl border select-none transition-colors ${
                  webSearchEnabled
                    ? 'border-sky-400 bg-sky-50 text-sky-600 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-400'
                    : 'border-gray-200 dark:border-zinc-600 text-gray-300 dark:text-zinc-600'
                } ${!panelOpen ? 'hover:opacity-80' : 'cursor-default'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span className="text-[10px] font-bold leading-none">{webSearchEnabled ? 'ON' : 'OFF'}</span>
              </button>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="送信"
                title="送信"
                className="flex-none w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </form>
        </div>

        {/* デスクトップ用スペーサ: パネルを開いている間はチャットを左半分へ収める枠を確保する。
            全画面時もチャットは左半分のまま動かさず、オーバーレイ表示のパネル(z-20)が上に被さる
            （切り替え時にチャットが再レイアウトされず、パネルが覆うだけの滑らかな動きになる）。 */}
        <div
          aria-hidden
          className={`hidden md:block flex-none transition-[width] duration-300 ease-in-out ${
            panelOpen ? 'md:w-1/2' : 'w-0'
          }`}
        />

        <HandsonPanel
          isOpen={panelOpen}
          isFull={panelFull}
          onSetFull={setPanelFull}
          onClose={togglePanel}
          onUsePrompt={(text) => {
            setInput(text)
            inputRef.current?.focus()
          }}
          onWebSearchChange={setWebSearchEnabled}
          onPageChange={(pageId) => {
            // handson1〜3: gemma-3-4b（model 2）、handson4〜5: gemma-4-12b（model 1）
            switchModel(pageId <= 3 ? 2 : 1)
          }}
        />
      </div>

      <footer className="flex-none bg-white dark:bg-zinc-800 border-t border-gray-200 dark:border-zinc-700 px-4 py-2 flex items-center justify-between text-xs text-gray-400 dark:text-zinc-500">
        <span>© 2026 TED</span>
        <span className="hidden sm:block">AI の回答は参考情報です。重要な意思決定には専門家へご確認ください。</span>
      </footer>
    </div>
  )
}
