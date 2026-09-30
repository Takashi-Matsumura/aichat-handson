'use client'

import { startTransition, useState, useRef, useEffect, FormEvent } from 'react'
import HandsonPanel from './components/HandsonPanel'
import PromptBroadcastModal from './components/PromptBroadcastModal'
import { ChatHeader, type ModelInfo } from './components/chat/ChatHeader'
import { ChatWelcome, SuggestedPrompts } from './components/chat/ChatWelcome'
import { ChatMessageItem } from './components/chat/ChatMessageItem'
import { ChatComposer } from './components/chat/ChatComposer'
import { useBroadcast } from './components/chat/useBroadcast'
import { recordPersonalStat } from '@/lib/personal-stats'
import {
  appendStreamChunk,
  deleteDisplayedVersion,
  finalizeStreamedMessage,
  navigateVersion,
  parseStreamLine,
  type Message,
} from '@/lib/chat/messages'

// /analytics などへ画面遷移して戻ってきても会話が消えないよう、タブ内で保持する(sessionStorage)。
const MESSAGES_STORAGE_KEY = 'handson-chat-messages'

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelMounted, setPanelMounted] = useState(false)
  const [panelFull, setPanelFull] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [ragMode, setRagMode] = useState(false)
  // 知識ソースが登録されている(chunkCount > 0)、かつ埋め込みサーバーが起動しているときのみtrue
  const [ragAvailable, setRagAvailable] = useState(false)
  const [selectedModel, setSelectedModel] = useState<1 | 2>(1)
  // 管理者が /presenter からモデル1(gemma-4-12b)を一時的に利用停止できる（大人数開催時の負荷対策）
  const [model1Enabled, setModel1Enabled] = useState(true)
  const [modelInfos, setModelInfos] = useState<Record<1 | 2, ModelInfo>>({
    1: { model: null, label: null, online: false, ctxSize: null },
    2: { model: null, label: null, online: false, ctxSize: null },
  })
  const [usedTokens, setUsedTokens] = useState(0)
  const displayedUsedTokens = messages.length === 0 ? 0 : usedTokens
  const tokenizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const wasLoadingRef = useRef(false)
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  // 講師からのプロンプト配信(/presenter「プロンプト配信」タブ)
  const { broadcast, modalOpen: broadcastModalOpen, openModal: openBroadcastModal, closeModal: closeBroadcastModal } = useBroadcast()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 会話をタブ内(sessionStorage)に保存し、/analytics 等へ移動して戻ってきても復元できるようにする。
  // ストリーミング中は1トークンごとに messages が更新されるため、都度書き込まずデバウンスする。
  useEffect(() => {
    if (messagesSaveTimerRef.current) clearTimeout(messagesSaveTimerRef.current)
    messagesSaveTimerRef.current = setTimeout(() => {
      try {
        if (messages.length > 0) {
          sessionStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messages))
        } else {
          sessionStorage.removeItem(MESSAGES_STORAGE_KEY)
        }
      } catch {
        // 容量超過などで保存できなくても、会話自体には支障がないため無視する
      }
    }, 300)
    return () => { if (messagesSaveTimerRef.current) clearTimeout(messagesSaveTimerRef.current) }
  }, [messages])

  // 生成中の経過秒数を計測する（応答が長時間返らない場合にユーザーへ知らせるため）
  useEffect(() => {
    if (!loading) return
    const start = Date.now()
    const id = setInterval(() => setElapsedSec(Math.round((Date.now() - start) / 1000)), 1000)
    return () => { clearInterval(id); setElapsedSec(0) }
  }, [loading, streamingIndex])

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
    // 会話が空のときの表示(0)は displayedUsedTokens で導くので、ここでは計算しない。
    if (messages.length === 0) return
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
    // ブラウザに保存した会話と設定を復元する。サーバー側で描画したHTMLと食い違わないよう
    // 初期値(useStateの初期化)ではなく読み込み後に反映し、緊急でない更新として扱う
    // (app/analytics/page.tsx と同じ書き方)。
    startTransition(() => {
      try {
        const savedMessages = sessionStorage.getItem(MESSAGES_STORAGE_KEY)
        if (savedMessages) {
          const parsed = JSON.parse(savedMessages)
          if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed)
        }
      } catch {
        // 壊れたデータは無視して空の会話から始める
      }

      setPanelOpen(localStorage.getItem('handson-panel-open') === 'true')
      setThinking(localStorage.getItem('thinking-mode') === 'true')
      setRagMode(localStorage.getItem('rag-mode') === 'true')
      const saved = localStorage.getItem('selected-model')
      if (saved === '2') setSelectedModel(2)
      setPanelMounted(true)
    })

    // RAGの知識ソースが登録されているか(=トグルを有効にできるか)を確認する。
    // このリクエスト自体がインデックス構築のウォームアップも兼ねる。
    async function fetchRagStatus() {
      try {
        const res = await fetch('/api/rag/status')
        const data = await res.json()
        setRagAvailable(data.online === true && data.chunkCount > 0)
      } catch {
        setRagAvailable(false)
      }
    }
    fetchRagStatus()

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

    // 管理者によるモデル1(gemma-4-12b)の利用停止状態を取得する。
    async function fetchModelLock() {
      try {
        const res = await fetch('/api/admin/model-lock')
        const data = await res.json()
        const enabled = data.model1Enabled !== false
        setModel1Enabled(enabled)
        if (!enabled) {
          // localStorageの復元よりこちらが後勝ちになるよう、直接切り替える
          setSelectedModel((prev) => (prev === 1 ? 2 : prev))
          localStorage.setItem('selected-model', '2')
        }
      } catch {
        // 取得できない場合は「利用可能」のまま扱う
      }
    }
    fetchModelLock()
  }, [])

  // プロンプトを入力欄へ反映する共通処理。サンプルプロンプト・ハンズオンテキスト・
  // 講師からの配信プロンプトの3箇所から呼ぶ。
  function applyPromptText(text: string) {
    setInput(text)
    inputRef.current?.focus()
  }

  function switchModel(n: 1 | 2) {
    if (n === 1 && !model1Enabled) return // 管理者による利用停止中
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

  function toggleRag() {
    setRagMode((prev) => {
      localStorage.setItem('rag-mode', String(!prev))
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

  // 生成中の応答を中断する（メッセージ履歴は残す）。応答が長時間返らないときの避難ハッチ。
  function handleStop() {
    abortControllerRef.current?.abort()
    setLoading(false)
    setStreamingIndex(null)
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
    modelIdx: 1 | 2,
    useRag: boolean,
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
      body: JSON.stringify({ messages: historyMessages, thinking: useThink, modelIndex: modelIdx, rag: useRag }),
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
        const parsed = parseStreamLine(line)
        if (!parsed) continue

        if (parsed.error) throw new Error(parsed.error)

        if (parsed.handson_sources) {
          update(msg => ({ ...msg, sources: parsed.handson_sources, showSources: false }))
          continue
        }

        if (parsed.handson_stats) {
          recordPersonalStat(parsed.handson_stats)
          continue
        }

        const chunk = parsed.choices?.[0]?.delta?.content ?? ''
        if (chunk) update(msg => appendStreamChunk(msg, chunk))
      }
    }

    update(finalizeStreamedMessage)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setError(null)
    const useThink = thinking
    const useRag = ragMode && ragAvailable
    const userMessage: Message = { role: 'user', content: text }
    const history = [...messages, userMessage]
    const targetIndex = history.length
    setMessages([...history, { role: 'assistant', content: '', thinkingEnabled: useThink, ragEnabled: useRag }])
    setInput('')
    setLoading(true)
    setStreamingIndex(targetIndex)

    try {
      await streamInto(
        targetIndex,
        history.map(m => ({ role: m.role, content: m.content })),
        useThink,
        selectedModel,
        useRag,
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 中断時点で1文字も届いていなければ、空の吹き出しを残さずメッセージごと消す
        // （送信前の状態に戻す）。何か届いていれば、そこまでの内容を「停止しました」として残す。
        setMessages(prev => {
          const target = prev[targetIndex]
          if (!target) return prev
          if (target.content === '' && !target.thinking) return prev.slice(0, targetIndex)
          return prev.map((m, j) => (j === targetIndex ? { ...m, stopped: true, thinkingDone: true } : m))
        })
        return
      }
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      // ユーザーメッセージ＋空のアシスタント枠の両方を取り除き、送信前の状態に戻す
      // （末尾1件だけ消すと、次の送信でuserロールが連続してしまい、モデルによっては
      // チャットテンプレートのrole交互チェックに引っかかる）
      setMessages(prev => prev.slice(0, targetIndex - 1))
      setInput(text)
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
    const useThink = thinking
    const useRag = ragMode && ragAvailable
    const prevVersions = [...(msg.versions ?? []), msg.content]

    setMessages(prev => prev.map((m, j) =>
      j !== index ? m : {
        ...m,
        content: '',
        stopped: undefined,
        thinkingEnabled: useThink,
        thinkingDone: undefined,
        rawThinking: undefined,
        thinking: undefined,
        showThinking: undefined,
        tokens: undefined,
        showTokens: undefined,
        versions: prevVersions,
        displayVersionIdx: undefined,
        ragEnabled: useRag,
        sources: undefined,
        showSources: undefined,
      }
    ))
    setLoading(true)
    setStreamingIndex(index)

    try {
      await streamInto(
        index,
        messages.slice(0, index).map(m => ({ role: m.role, content: m.content })),
        useThink,
        selectedModel,
        useRag,
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => prev.map((m, j) => {
          if (j !== index) return m
          // 中断時点で1文字も届いていなければ、再生成前の回答にそのまま戻す（何もなかったことにする）
          if (m.content === '' && !m.thinking) {
            return { ...m, content: prevVersions[prevVersions.length - 1], versions: msg.versions, displayVersionIdx: undefined }
          }
          // 何か届いていれば、そこまでの内容を「停止しました」として残す
          return { ...m, stopped: true, thinkingDone: true }
        }))
        return
      }
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
    setMessages(prev => prev.map((m, j) => (j === index ? navigateVersion(m, delta) : m)))
  }

  function handleDeleteVersion(index: number) {
    setMessages(prev => prev.map((m, j) => (j === index ? deleteDisplayedVersion(m) : m)))
  }

  // メッセージ1件の表示状態(思考過程・参照資料の開閉)を切り替える
  function toggleMessageFlag(index: number, key: 'showThinking' | 'showSources') {
    setMessages(prev => prev.map((m, j) => (j === index ? { ...m, [key]: !m[key] } : m)))
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-zinc-900">
      <ChatHeader
        modelInfos={modelInfos}
        selectedModel={selectedModel}
        model1Enabled={model1Enabled}
        panelOpen={panelOpen}
        panelMounted={panelMounted}
        onSwitchModel={switchModel}
        onTogglePanel={togglePanel}
      />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${
          isEmpty ? 'justify-center-safe overflow-y-auto px-4 py-6' : ''
        }`}>
          <div className={isEmpty ? 'flex-none' : 'flex-1 overflow-y-auto px-4 py-4 space-y-4'}>
            {isEmpty && <ChatWelcome panelOpen={panelOpen} />}
            {messages.map((msg, i) => (
              <ChatMessageItem
                key={i}
                msg={msg}
                isStreamingTarget={i === streamingIndex}
                loading={loading}
                elapsedSec={elapsedSec}
                onToggleThinking={() => toggleMessageFlag(i, 'showThinking')}
                onStop={handleStop}
                onRegenerate={() => handleRegenerate(i)}
                onVersionNav={(delta) => handleVersionNav(i, delta)}
                onDeleteVersion={() => handleDeleteVersion(i)}
                onTokenToggle={() => handleTokenToggle(i, msg.content, !!msg.tokens)}
                onToggleSources={() => toggleMessageFlag(i, 'showSources')}
              />
            ))}
            {error && (
              <div className="flex justify-center">
                <p className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">
                  {error}
                </p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* 配信中のプロンプトをモーダルで閉じた後も見返せるようにする再表示ボタン */}
          {broadcast && !broadcastModalOpen && (
            <div className={`flex ${isEmpty ? 'w-full max-w-2xl mx-auto' : ''} justify-center px-3 pb-2`}>
              <button
                type="button"
                onClick={openBroadcastModal}
                className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium bg-ocean-100 text-ocean-700 hover:bg-ocean-200 dark:bg-ocean-900/30 dark:text-ocean-400 dark:hover:bg-ocean-900/50 transition-colors shadow-sm"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
                  <path d="M3 11l18-5v12L3 14v-3z" />
                  <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                </svg>
                講師からのプロンプトを見る
              </button>
            </div>
          )}

          <ChatComposer
            isEmpty={isEmpty}
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            inputRef={inputRef}
            loading={loading}
            onStop={handleStop}
            onClearChat={handleClearChat}
            usedTokens={displayedUsedTokens}
            ctxSize={modelInfos[selectedModel].ctxSize}
            ragAvailable={ragAvailable}
            ragMode={ragMode}
            onToggleRag={toggleRag}
            showThinkingToggle={selectedModel === 1}
            thinking={thinking}
            onToggleThinking={toggleThinking}
          />

          {/* ハンズオンテキスト表示中はサンプルプロンプトを出さず、ハンズオンの指示に集中させる */}
          {isEmpty && !panelOpen && <SuggestedPrompts onSelect={applyPromptText} />}
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
          onUsePrompt={applyPromptText}
          onPageChange={() => {
            // 「AIの推論とエージェント」（gemma-4-12b使用）を一時非表示にしたため、
            // ハンズオン中は常に gemma-3-4b（model 2）を使う。
            // switchModel は会話を空にするため、すでにモデル2なら呼ばない。パネルは表示時・
            // 開いた時にもこれを呼ぶので、無条件に呼ぶとブラウザから復元した会話や
            // 進行中の会話が消えてしまう。
            if (selectedModel !== 2) switchModel(2)
          }}
        />
      </div>

      <PromptBroadcastModal
        isOpen={broadcastModalOpen}
        title={broadcast?.title ?? ''}
        body={broadcast?.body ?? ''}
        onClose={closeBroadcastModal}
        onUsePrompt={applyPromptText}
      />

      <footer className="flex-none bg-white dark:bg-zinc-800 border-t border-gray-200 dark:border-zinc-700 px-4 py-2 flex items-center justify-between text-xs text-gray-400 dark:text-zinc-500">
        <span>© 2026 MatsBACCANO</span>
        <span className="hidden sm:block">AI の回答は参考情報です。重要な意思決定には専門家へご確認ください。</span>
      </footer>
    </div>
  )
}
