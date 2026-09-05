// クラウドAI相当の「参考コスト」を算出するための単価表。
//
// このアプリは完全ローカル実行のため実際の課金は一切発生しない。ここでの金額は
// 「同等サイズのオープンウェイトモデルをクラウドAPI経由で使った場合、参考としていくら
// かかりそうか」を示す教材用の推定値であり、正確な市場価格の追跡値ではない。
//
// 算出根拠: クラウドAPIのトークン単価は、モデルの世代よりもパラメータ数（＝推論に
// 必要な計算量）と強く相関する。オープンウェイトモデルを扱う主要な推論ホスティング
// （Together AI・Fireworks・DeepInfra・OpenRouter 経由の集計など）で観測される
// サイズ帯ごとの相場感（$/100万トークン、2025年時点の実勢を参考）は概ね以下の通り。
//
//   〜4B（最小クラス）    : 入力 $0.015〜$0.03　/ 出力 $0.03〜$0.06
//   12〜14B（中間クラス） : 入力 $0.05〜$0.08　 / 出力 $0.08〜$0.15
//
// gemma-3-4b は実在するGoogleのGemma 3ファミリー4Bモデルで「最小クラス」にそのまま
// 該当。gemma-4-12b はこのハンズオン内の想定モデルだが、実在するGemma 3 12Bと同じ
// パラメータ規模（12B、起動時のllama.cppメタデータで確認済み）のため「中間クラス」の
// 相場をそのまま採用した。各レンジの中央〜やや低めの、きりの良い数字に丸めている。

export type ModelPricing = { inputPer1M: number; outputPer1M: number }

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gemma-4-12b': { inputPer1M: 0.06, outputPer1M: 0.12 },
  'gemma-3-4b': { inputPer1M: 0.02, outputPer1M: 0.05 },
}

/** 単価表に無いモデル名の場合は 0（$0.00）を返す。 */
export function estimateCost(model: string, inputTokens?: number, outputTokens?: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  const inputCost = ((inputTokens ?? 0) / 1_000_000) * pricing.inputPer1M
  const outputCost = ((outputTokens ?? 0) / 1_000_000) * pricing.outputPer1M
  return inputCost + outputCost
}

// 円換算の参考レート(USD→JPY)。実際の為替相場は日々変動するが、このアプリのコスト自体が
// 教材用の概算値であるのと同様、ハンズオン中は固定値として扱う。
export const USD_TO_JPY_RATE = 150

/** USD金額を円に換算する(表示用)。集計・保存は常にUSDのまま行う。 */
export function toJPY(usd: number): number {
  return usd * USD_TO_JPY_RATE
}

/** 推定コスト(USD)を「¥0.060」のような表示用文字列に変換する。 */
export function formatJPY(usd: number): string {
  return `¥${toJPY(usd).toFixed(3)}`
}
