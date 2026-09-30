// チャット画面(app/page.tsx)で扱うメッセージの型と、メッセージを更新する純粋な処理。
// React に依存しないため、ここに置いて単体テストする(lib/chat/messages.test.ts)。

import type { SourceRef } from '@/lib/rag/prompt'

export type Token = { id: number; piece: string }

export type Message = {
  role: 'user' | 'assistant'
  content: string
  thinkingEnabled?: boolean
  rawThinking?: string
  thinking?: string
  thinkingDone?: boolean
  showThinking?: boolean
  tokens?: Token[]
  showTokens?: boolean
  versions?: string[]
  displayVersionIdx?: number
  stopped?: boolean
  ragEnabled?: boolean
  // undefined = まだ受信していない（RAG OFF、または応答が完了していない）
  // [] = 検索したが該当する資料が無かった
  sources?: SourceRef[]
  showSources?: boolean
}

// /api/chat が返すSSEの1イベント分。llama.cpp の OpenAI互換チャンクに加え、
// サーバーが先頭に参照資料(handson_sources)、末尾に利用実績(handson_stats)を差し込む。
export type ChatStreamPayload = {
  choices?: { delta?: { content?: string } }[]
  error?: string
  handson_sources?: SourceRef[]
  handson_stats?: { model: string; inputTokens: number; outputTokens: number; estimatedCost: number; latencyMs: number }
}

// SSEの1行("data: {...}")を解析する。data行以外・[DONE]・JSONとして不正な行は null。
export function parseStreamLine(line: string): ChatStreamPayload | null {
  if (!line.startsWith('data: ')) return null
  const payload = line.slice(6)
  if (payload === '[DONE]') return null
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

const THINK_OPEN = /^<think>\n?/
const THINK_CLOSE = '</think>'

// ストリームで届いた断片を回答に追記する。推論モードでは </think> が届くまでを思考過程として
// 分けて保持し、以降を回答本文にする。
export function appendStreamChunk(msg: Message, chunk: string): Message {
  if (!msg.thinkingEnabled || msg.thinkingDone) {
    return { ...msg, content: msg.content + chunk }
  }
  const rawAcc = (msg.rawThinking ?? '') + chunk
  const closeIdx = rawAcc.indexOf(THINK_CLOSE)
  if (closeIdx !== -1) {
    const rawThinking = rawAcc.slice(0, closeIdx)
    const cleanThinking = rawThinking.replace(THINK_OPEN, '')
    const afterThink = rawAcc.slice(closeIdx + THINK_CLOSE.length).trimStart()
    return { ...msg, rawThinking: rawAcc, thinking: cleanThinking, thinkingDone: true, showThinking: true, content: afterThink }
  }
  const cleanThinking = rawAcc.replace(THINK_OPEN, '')
  return { ...msg, rawThinking: rawAcc, thinking: cleanThinking, thinkingDone: false, content: '' }
}

// ストリーム終了時の後処理。推論モードなのに </think> が最後まで来なかった場合は、
// 思考過程として溜めていた内容を回答本文として扱う。
export function finalizeStreamedMessage(msg: Message): Message {
  if (msg.thinkingEnabled && !msg.thinkingDone && msg.rawThinking) {
    return { ...msg, thinkingDone: true, content: msg.rawThinking.replace(THINK_OPEN, ''), thinking: undefined }
  }
  return msg
}

// 画面に表示する回答本文(再生成の過去バージョンを表示中ならそのバージョン)。
export function displayedContent(msg: Message): string {
  return msg.displayVersionIdx !== undefined && msg.versions ? msg.versions[msg.displayVersionIdx] : msg.content
}

// 再生成した回答のバージョンを前後に切り替える。最新版(content)を表示するときは displayVersionIdx を undefined にする。
export function navigateVersion(msg: Message, delta: number): Message {
  if (!msg.versions) return msg
  const total = msg.versions.length + 1
  const current = msg.displayVersionIdx ?? (total - 1)
  const next = Math.max(0, Math.min(total - 1, current + delta))
  return { ...msg, displayVersionIdx: next === total - 1 ? undefined : next, showTokens: false }
}

// 表示中のバージョンを削除する。最新版を削除した場合は、ひとつ前のバージョンを最新に昇格させる。
export function deleteDisplayedVersion(msg: Message): Message {
  if (!msg.versions || msg.versions.length === 0) return msg

  if (msg.displayVersionIdx !== undefined) {
    // 過去バージョンを削除
    const idx = msg.displayVersionIdx
    const newVersions = [...msg.versions.slice(0, idx), ...msg.versions.slice(idx + 1)]
    const newDisplayIdx = newVersions.length === 0 ? undefined : idx > 0 ? idx - 1 : 0
    return {
      ...msg,
      versions: newVersions.length > 0 ? newVersions : undefined,
      displayVersionIdx: newDisplayIdx,
      showTokens: false,
    }
  }

  // 最新版（content）を削除 → ひとつ前を最新に昇格
  const newVersions = msg.versions.slice(0, -1)
  return {
    ...msg,
    content: msg.versions[msg.versions.length - 1],
    versions: newVersions.length > 0 ? newVersions : undefined,
    displayVersionIdx: undefined,
    tokens: undefined,
    showTokens: false,
  }
}
