import { NextRequest } from 'next/server'

const LLAMA_URLS: Record<number, string> = {
  1: process.env.LLAMA_API_URL ?? 'http://localhost:8080',
  2: process.env.LLAMA_API_URL_2 ?? 'http://localhost:8081',
}

export async function POST(request: NextRequest) {
  const { content, modelIndex } = await request.json()
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
