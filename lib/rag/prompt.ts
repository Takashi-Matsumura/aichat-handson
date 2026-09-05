// 検索結果(Hit[])を、クライアント表示用の SourceRef と、LLMのsystemに埋め込む
// コンテキスト文字列に変換する。

import type { Hit } from './search'

export type SourceRef = {
  id: string
  file: string
  title: string
  snippet: string
  score: number
}

const SNIPPET_LENGTH = 200

export function toSourceRefs(hits: Hit[]): SourceRef[] {
  return hits.map(hit => ({
    id: hit.chunk.id,
    file: hit.chunk.file,
    title: hit.chunk.title,
    snippet: hit.chunk.text.length > SNIPPET_LENGTH ? `${hit.chunk.text.slice(0, SNIPPET_LENGTH)}…` : hit.chunk.text,
    score: Math.round(hit.score * 1000) / 1000,
  }))
}

export function buildContextBlock(hits: Hit[]): string {
  const sections = hits
    .map((hit, i) => `[資料${i + 1}] ${hit.chunk.title}\n${hit.chunk.text}`)
    .join('\n\n')
  return (
    '以下は社内資料からの抜粋です。ユーザーの質問にはこの資料の内容を根拠として回答してください。\n' +
    '資料に書かれていないことは推測せず、「資料には記載がありません」と答えてください。\n\n' +
    sections
  )
}
