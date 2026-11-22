// 会話から Web検索用のクエリを作る。
//
// 「それについてもっと詳しく」のような発言をそのまま検索しても意味のある結果は返らないため、
// 直近の会話をLLMに渡して検索キーワードに書き換えさせる。失敗したら最後の発言をそのまま使う。

import { WEB_SEARCH_CONFIG } from './config'

export type QueryMessage = { role: 'user' | 'assistant'; content: string }

const HISTORY_MESSAGES = 6
const HISTORY_CHARS_PER_MESSAGE = 500
const QUERY_MAX = 200

export function lastUserContent(messages: QueryMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return ''
}

// ユーザーの発言をそのまま検索する場合のクエリ(フォールバック)。
export function fallbackQuery(messages: QueryMessage[]): string {
  return lastUserContent(messages).replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX)
}

export function buildQueryPrompt(messages: QueryMessage[], today: string): { system: string; user: string } {
  const history = messages
    .slice(-HISTORY_MESSAGES)
    .map(m => {
      const text = m.content.length > HISTORY_CHARS_PER_MESSAGE ? `${m.content.slice(0, HISTORY_CHARS_PER_MESSAGE)}…` : m.content
      return `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${text}`
    })
    .join('\n')
  return {
    system:
      `あなたは検索クエリを作るアシスタントです。今日の日付は${today}です。\n` +
      '会話の最後のユーザー発言に答えるために、Web検索エンジンへ入力する検索クエリを1つだけ作ってください。\n' +
      '- 重要なキーワードを空白区切りで並べ、10語以内にする\n' +
      '- 「それ」「あれ」などの指示語は会話の内容から具体的な言葉に置き換える\n' +
      '- 検索クエリだけを1行で出力し、説明・引用符・記号は付けない',
    user: `# 会話\n${history}\n\n# 検索クエリ`,
  }
}

// LLMの出力から検索クエリ1行を取り出す。思考タグ・ラベル・引用符などを取り除く。
export function cleanQuery(raw: string): string {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '')
  const line = withoutThink.split('\n').map(l => l.trim()).find(l => l !== '') ?? ''
  return line
    .replace(/^(#+\s*)?(検索クエリ|クエリ|query)\s*[:：]\s*/i, '')
    .replace(/[`"'「」『』“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, QUERY_MAX)
}

// 検索クエリを生成する。LLMに繋がらない・時間がかかりすぎる・空を返した場合は
// ユーザーの発言をそのまま使う(例外は投げない)。
export async function generateSearchQuery(
  llamaUrl: string,
  model: string,
  messages: QueryMessage[],
  today: string,
): Promise<string> {
  const fallback = fallbackQuery(messages)
  const { system, user } = buildQueryPrompt(messages, today)
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
        max_tokens: 64,
        // 推論(thinking)対応モデルで思考に生成枠を使い切らないよう、思考を無効にする。
        // 対応していないチャットテンプレートでは無視される。
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.timeout(WEB_SEARCH_CONFIG.queryTimeoutMs),
    })
    if (!res.ok) return fallback
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const query = cleanQuery(data.choices?.[0]?.message?.content ?? '')
    return query || fallback
  } catch {
    return fallback
  }
}
