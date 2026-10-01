// LLMの応答テキストからJSONを取り出す緩いパース。
// response_format(json_schema) が効かないサーバーでは "```json ... ```" のように
// コードフェンスや前置きが付くことがあるため、最初の { から最後の } までを拾って再挑戦する。
// 分類(lib/analytics/classify.ts)と確認テスト(lib/quiz/generate.ts)で共用する。
export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}
