import { NextRequest } from 'next/server'

const LLAMA_URLS: Record<number, string> = {
  1: process.env.LLAMA_API_URL ?? 'http://localhost:8080',
  2: process.env.LLAMA_API_URL_2 ?? 'http://localhost:8081',
}

const LLAMA_LABELS: Record<number, string | undefined> = {
  1: process.env.LLAMA_MODEL_LABEL_1,
  2: process.env.LLAMA_MODEL_LABEL_2,
}

export async function GET(request: NextRequest) {
  const n = Math.max(1, Math.min(2, Number(request.nextUrl.searchParams.get('n') ?? '1')))
  const LLAMA_URL = LLAMA_URLS[n] ?? LLAMA_URLS[1]
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
