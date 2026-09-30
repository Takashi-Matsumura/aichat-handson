import { NextRequest } from 'next/server'
import { LLAMA_URLS } from '@/lib/llama/config'
import { MAX_TOKENIZE_CHARS } from '@/lib/chat/limits'
import { readJsonObject } from '@/lib/http/json'

export async function POST(request: NextRequest) {
  const body = await readJsonObject(request)
  const content = body?.content
  if (typeof content !== 'string' || content.length > MAX_TOKENIZE_CHARS) {
    return Response.json({ error: 'tokenize failed' }, { status: 400 })
  }
  const modelIndex = body!.modelIndex
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
