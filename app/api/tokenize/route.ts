import { NextRequest } from 'next/server'

const LLAMA_URLS: Record<number, string> = {
  1: process.env.LLAMA_API_URL ?? 'http://localhost:8080',
  2: process.env.LLAMA_API_URL_2 ?? 'http://localhost:8081',
}

// チャット画面は会話全体(app/api/chat/route.ts の上限 30,000文字 + 最大200件分の区切り)を送ってくるため、
// それを少し上回る値を上限にする。巨大な入力で推論サーバーを占有されるのを防ぐ。
const MAX_CONTENT_CHARS = 31_000

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const content = body?.content
  if (typeof content !== 'string' || content.length > MAX_CONTENT_CHARS) {
    return Response.json({ error: 'tokenize failed' }, { status: 400 })
  }
  const modelIndex = body.modelIndex
  const n = modelIndex === 2 ? 2 : 1
  const LLAMA_URL = LLAMA_URLS[n]

  try {
    const res = await fetch(`${LLAMA_URL}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, add_special: false, with_pieces: true }),
    })
    if (!res.ok) {
      return Response.json({ error: 'tokenize failed' }, { status: res.status })
    }
    return Response.json(await res.json())
  } catch {
    return Response.json({ error: 'tokenize failed' }, { status: 503 })
  }
}
