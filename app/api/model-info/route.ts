import { NextRequest } from 'next/server'
import { LLAMA_MODEL_LABELS as LLAMA_LABELS, LLAMA_URLS, type ModelIndex } from '@/lib/llama/config'

export async function GET(request: NextRequest) {
  // ?n=2 以上はモデル2、それ以外(数値でない値を含む)はモデル1として扱う。
  const n: ModelIndex = Number(request.nextUrl.searchParams.get('n') ?? '1') >= 2 ? 2 : 1
  const LLAMA_URL = LLAMA_URLS[n]
  try {
    const [modelsRes, slotsRes] = await Promise.all([
      fetch(`${LLAMA_URL}/v1/models`, { cache: 'no-store' }),
      fetch(`${LLAMA_URL}/slots`, { cache: 'no-store' }),
    ])

    if (!modelsRes.ok) return Response.json({ model: null, ctxSize: null, parallel: null })

    const data = await modelsRes.json()
    const entry = data.data?.[0]
    const id: string = entry?.id ?? null
    const model = id ? id.replace(/\.gguf$/i, '') : null
    let ctxSize: number | null = null
    let parallel: number | null = null
    if (slotsRes.ok) {
      const slots = await slotsRes.json()
      if (Array.isArray(slots)) {
        parallel = slots.length
        ctxSize = slots[0]?.n_ctx ?? null
      }
    }

    const label = LLAMA_LABELS[n] ?? null
    return Response.json({ model, ctxSize, parallel, label })
  } catch {
    return Response.json({ model: null, ctxSize: null, parallel: null, label: LLAMA_LABELS[n] ?? null })
  }
}
