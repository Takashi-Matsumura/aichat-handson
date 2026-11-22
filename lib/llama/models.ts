// モデル1/2を区別した実際のモデル名。llama.cpp へ送るモデル名(LLAMA_MODEL)は環境変数1つの
// 共通値のため、利用状況分析・推定コスト算出・画面表示ではこちらを使う。
// 環境変数を読まないので、クライアント(/analytics)からも import できる。

import type { ModelIndex } from './config'

export const ANALYTICS_MODEL_NAMES: Record<ModelIndex, string> = {
  1: 'gemma-4-12b',
  2: 'gemma-3-4b',
}
