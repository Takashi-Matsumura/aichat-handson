// チャット応答完了後(after())に呼ばれる共通フック。
// マスキング → インメモリストアへの記録 → 同じ llama.cpp への分類問い合わせ、を1箇所にまとめる。
// レイテンシに影響させないため、必ず after() のコールバックから呼び出すこと。

import { maskText } from './masking'
import { classify } from './classify'
import { addRequest, attachClassification } from './store'
import { estimateCost } from './pricing'

type RecordInput = {
  llamaUrl: string
  model: string
  promptText: string
  responseText?: string
  latencyMs: number
  usage?: { inputTokens?: number; outputTokens?: number }
  status?: 'success' | 'error'
  errorMessage?: string
}

// 分類(カテゴリ判定)に使うのはプロンプト・応答それぞれの先頭部分だけで十分。全文を送ると、
// 長い入力のたびにチャットと同じ llama.cpp のスロットを分類(再試行込みで最大6回)が長時間占有する。
const CLASSIFY_MAX_CHARS = 2000

export async function recordAndClassify(input: RecordInput): Promise<void> {
  const status = input.status ?? 'success'
  const { masked: promptMasked } = maskText(input.promptText.slice(0, CLASSIFY_MAX_CHARS))
  const responseMasked = input.responseText
    ? maskText(input.responseText.slice(0, CLASSIFY_MAX_CHARS)).masked
    : undefined
  const id = crypto.randomUUID()

  addRequest({
    id,
    provider: 'local-llama-cpp',
    model: input.model,
    inputTokens: input.usage?.inputTokens,
    outputTokens: input.usage?.outputTokens,
    estimatedCost: estimateCost(input.model, input.usage?.inputTokens, input.usage?.outputTokens),
    latencyMs: input.latencyMs,
    status,
    errorMessage: input.errorMessage,
    createdAt: new Date(),
  })

  // 分類は応答のレイテンシに影響させない箇所(after)で呼ばれる想定。失敗しても記録自体は残す。
  if (status === 'success' && responseMasked) {
    try {
      const classification = await classify(input.llamaUrl, input.model, promptMasked, responseMasked)
      attachClassification(id, classification)
    } catch (err) {
      console.error('[analytics] classification failed:', err)
    }
  }
}
