// チャット用 llama-server(モデル1・モデル2)への接続設定。
// app/api/chat, app/api/tokenize, app/api/model-info の3箇所で共通に使う。
// RAG用の埋め込みサーバーの設定は lib/rag/config.ts にある。

export type ModelIndex = 1 | 2

export const LLAMA_URLS: Record<ModelIndex, string> = {
  1: process.env.LLAMA_API_URL ?? 'http://localhost:8080',
  2: process.env.LLAMA_API_URL_2 ?? 'http://localhost:8081',
}

// llama.cpp へのリクエストで送るモデル名。モデル1/2で共通の1つの値。
export const LLAMA_MODEL = process.env.LLAMA_MODEL ?? 'gemma4'

// 画面に表示するモデル名。未設定ならモデル名から自動生成する(画面側)。
export const LLAMA_MODEL_LABELS: Record<ModelIndex, string | undefined> = {
  1: process.env.LLAMA_MODEL_LABEL_1,
  2: process.env.LLAMA_MODEL_LABEL_2,
}
