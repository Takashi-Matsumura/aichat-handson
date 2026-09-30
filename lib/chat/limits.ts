// チャット・トークン数計算APIの入力上限と、チャットのメッセージ検証。
//
// 巨大な入力で推論サーバーのスロットを長時間占有される(会場全体が詰まる)のを防ぐためのもの。
// 文字数はペイロードだけでなく推論時間にも効くため小さめにしてある
// (モデル2では10万文字近い入力1件で約2分占有された)。
// 長い会話で上限に達した受講者には、新しい会話を始めるよう案内する。

export const MAX_MESSAGES = 200
export const MAX_TOTAL_CHARS = 30_000

// チャット画面はトークン数表示のために会話全体(MAX_TOTAL_CHARS + 最大200件分の区切り)を
// /api/tokenize に送ってくるため、それを少し上回る値を上限にする。
export const MAX_TOKENIZE_CHARS = 31_000

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

// クライアントから受け取った messages を検証する。systemロールはサーバー側
// (思考プロセス指示・RAGのcontext)だけが付与するため、クライアントからは受け付けない。
export function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null
  let totalChars = 0
  const messages: ChatMessage[] = []
  for (const m of value) {
    if (!m || typeof m !== 'object') return null
    const { role, content } = m as { role?: unknown; content?: unknown }
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    totalChars += content.length
    if (totalChars > MAX_TOTAL_CHARS) return null
    messages.push({ role, content })
  }
  return messages
}
