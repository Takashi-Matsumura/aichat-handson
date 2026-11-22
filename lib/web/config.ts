// Web検索(インターネット情報を使った回答)の設定。
//
// 検索には自前ホストの SearXNG(メタ検索エンジン)を使う。SEARXNG_URL が未設定なら
// Web検索機能そのものを無効にする(検索クエリが外部へ送られる機能なので、明示的に有効化した
// 環境でだけ使えるようにする)。

export const WEB_SEARCH_CONFIG = {
  // 例: docker-compose なら http://searxng:8080、ローカル開発なら http://localhost:8888
  searxngUrl: (process.env.SEARXNG_URL ?? '').replace(/\/+$/, ''),
  // LLMに渡す検索結果の件数。小さいモデルのコンテキストを圧迫しないよう少なめにする。
  topK: Number(process.env.WEB_SEARCH_TOP_K ?? 5),
  // SearXNG は複数の検索エンジンへ問い合わせるため、遅いエンジンに引きずられないよう上限を設ける。
  timeoutMs: Number(process.env.WEB_SEARCH_TIMEOUT_MS ?? 8000),
  // 検索クエリの生成(LLM)に掛ける時間の上限。超えたらユーザーの発言をそのまま検索する。
  queryTimeoutMs: Number(process.env.WEB_SEARCH_QUERY_TIMEOUT_MS ?? 15000),
  language: process.env.WEB_SEARCH_LANGUAGE ?? 'ja',
} as const

export function isWebSearchConfigured(): boolean {
  return WEB_SEARCH_CONFIG.searxngUrl !== ''
}
