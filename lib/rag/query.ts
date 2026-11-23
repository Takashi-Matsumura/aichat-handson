// 検索モードで使う検索語を、会話からAIに作らせる。
//
// 最後の質問文だけをそのまま埋め込み検索すると、「それはいつまで？」のような続きの質問や、
// 資料と違う言い方(在宅勤務／リモートワーク)の質問で、関係する部分を取りこぼす。
// そこで、指示語を具体的な言葉に置き換え、資料に書かれていそうな言い換えを含めた検索語を
// 複数作らせ、元の質問文と合わせて検索する(lib/rag/search.ts の retrieveMulti)。

import { NO_BUILTIN_REASONING } from '@/lib/llama/config'
import { RAG_CONFIG } from './config'

export type RagQueryMessage = { role: 'user' | 'assistant'; content: string }

const HISTORY_MESSAGES = 6
const HISTORY_CHARS_PER_MESSAGE = 500
const QUERY_MAX = 100

export function buildRagQueryPrompt(messages: RagQueryMessage[], count: number): { system: string; user: string } {
  const history = messages
    .slice(-HISTORY_MESSAGES)
    .map(m => {
      const text = m.content.length > HISTORY_CHARS_PER_MESSAGE ? `${m.content.slice(0, HISTORY_CHARS_PER_MESSAGE)}…` : m.content
      return `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${text}`
    })
    .join('\n')
  return {
    system:
      'あなたは社内資料(就業規則・各種規程・マニュアルなど)を検索するための検索文を作るアシスタントです。\n' +
      `会話の最後のユーザー発言に答えるのに必要な情報を探す検索文を、最大${count}個作ってください。\n` +
      '- 「それ」「あれ」などの指示語は、会話の内容から具体的な言葉に置き換える\n' +
      '- 社内資料で使われていそうな言い方に言い換えたものも含める(例: 在宅勤務→リモートワーク、お金の補助→手当)\n' +
      '- 答えるのに複数の情報が必要なら、それぞれを別の検索文にする\n' +
      '- 1行に1つ、短い文で出力し、番号・説明・引用符は付けない',
    user: `# 会話\n${history}\n\n# 検索文`,
  }
}

// AIの出力から検索文を取り出す。思考タグ・番号・記号を取り除き、重複と空行を除く。
export function parseRagQueries(raw: string, count: number): string[] {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '')
  const seen = new Set<string>()
  const queries: string[] = []
  for (const line of text.split('\n')) {
    const q = line
      .trim()
      .replace(/^(#+\s*)?(検索文|検索クエリ|クエリ|query)\s*[:：]\s*/i, '')
      .replace(/^([-*・•]|\d+[.)．、]|[（(]\d+[)）])\s*/, '')
      .replace(/[`"'「」『』“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, QUERY_MAX)
    if (!q || seen.has(q)) continue
    seen.add(q)
    queries.push(q)
    if (queries.length >= count) break
  }
  return queries
}

// 検索文を生成する。AIに繋がらない・時間がかかりすぎる・空を返した場合は空配列を返す
// (呼び出し側は元の質問文だけで検索する。例外は投げない)。
export async function generateRagQueries(
  llamaUrl: string,
  model: string,
  messages: RagQueryMessage[],
  count: number = RAG_CONFIG.queryCount,
): Promise<string[]> {
  if (count <= 0) return []
  const { system, user } = buildRagQueryPrompt(messages, count)
  try {
    const res = await fetch(`${llamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
        temperature: 0,
        max_tokens: 160,
        // 推論(thinking)対応モデルで思考に生成枠を使い切らないよう、思考を無効にする。
        ...NO_BUILTIN_REASONING,
      }),
      signal: AbortSignal.timeout(RAG_CONFIG.queryTimeoutMs),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return parseRagQueries(data.choices?.[0]?.message?.content ?? '', count)
  } catch {
    return []
  }
}
