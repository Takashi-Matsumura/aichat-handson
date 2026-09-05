// Markdown/テキストをチャンク分割する純粋関数。
//
// 方式: 見出し単位に分割し、パンくず(title)を作る。1セクションが長すぎる場合のみ
// 固定文字数+オーバーラップのスライディングウィンドウで再分割する(フォールバック)。
// 見出しの無い .txt はフォールバックのみを適用する。
//
// 日本語コンテンツを想定し、文字数(String.length)ベースで数える。トークン数ではないが、
// 500文字 ≒ 350〜450トークン程度で、埋め込みモデルの512トークン窓に収まる安全域になる。

import { RAG_CONFIG } from './config'

export type RawChunk = { title: string; text: string }

const MIN_CHUNK_LENGTH = 20

export function chunkMarkdown(content: string, fallbackTitle: string): RawChunk[] {
  const sections = splitByHeading(content, fallbackTitle)
  const chunks: RawChunk[] = []
  for (const section of sections) {
    const text = section.text.trim()
    if (!text) continue
    if (text.length <= RAG_CONFIG.chunkSize) {
      chunks.push({ title: section.title, text })
      continue
    }
    for (const piece of splitByWindow(text)) {
      chunks.push({ title: section.title, text: piece })
    }
  }
  return chunks.filter(c => c.text.length >= MIN_CHUNK_LENGTH)
}

export function chunkPlainText(content: string, fallbackTitle: string): RawChunk[] {
  const text = content.trim()
  if (!text) return []
  if (text.length <= RAG_CONFIG.chunkSize) {
    return [{ title: fallbackTitle, text }]
  }
  return splitByWindow(text)
    .filter(t => t.length >= MIN_CHUNK_LENGTH)
    .map(t => ({ title: fallbackTitle, text: t }))
}

// 行頭の `#`〜`######` で分割し、見出し階層をスタックで追ってパンくずを作る。
function splitByHeading(content: string, fallbackTitle: string): RawChunk[] {
  const lines = content.split('\n')
  const sections: RawChunk[] = []
  const headingStack: { level: number; text: string }[] = []
  let currentTitle = fallbackTitle
  let buffer: string[] = []

  const flush = () => {
    const text = buffer.join('\n').trim()
    if (text) sections.push({ title: currentTitle, text })
    buffer = []
  }

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      flush()
      const level = match[1].length
      const headingText = match[2].trim()
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop()
      }
      headingStack.push({ level, text: headingText })
      currentTitle = headingStack.map(h => h.text).join(' > ')
      continue
    }
    buffer.push(line)
  }
  flush()

  // 見出しが1つも無いファイル全体をそのまま1セクション扱いにする
  if (sections.length === 0) {
    const text = content.trim()
    return text ? [{ title: fallbackTitle, text }] : []
  }
  return sections
}

// 窓の末尾から句読点・改行を後方探索して自然な位置で切る。
// 窓の60%より手前でしか区切りが見つからない場合は、文脈が短くなりすぎるため窓幅で機械的に切る。
function splitByWindow(text: string): string[] {
  const { chunkSize, chunkOverlap } = RAG_CONFIG
  const pieces: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length)
    if (end < text.length) {
      const window = text.slice(start, end)
      const minCut = Math.floor(window.length * 0.6)
      const boundary = lastBoundary(window, minCut)
      if (boundary !== -1) end = start + boundary
    }
    pieces.push(text.slice(start, end).trim())
    if (end >= text.length) break
    start = Math.max(end - chunkOverlap, start + 1)
  }
  return pieces
}

function lastBoundary(window: string, minCut: number): number {
  const marks = ['。', '\n', '！', '？']
  let best = -1
  for (const mark of marks) {
    const idx = window.lastIndexOf(mark)
    if (idx >= minCut && idx + 1 > best) best = idx + 1
  }
  return best
}
