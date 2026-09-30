// APIルートでリクエスト本文(JSON)を読むための共通処理。
// request.json() をそのまま await すると、壊れたJSONを送られたときに例外で500になるため、
// ここで null に変換して呼び出し側で400を返せるようにする。

export type JsonObject = Record<string, unknown>

// 本文をJSONオブジェクトとして読む。JSONとして不正、またはオブジェクト以外(配列・文字列等)なら null。
export async function readJsonObject(request: Request): Promise<JsonObject | null> {
  try {
    const value: unknown = await request.json()
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null
  } catch {
    return null
  }
}

export function invalidJsonResponse(): Response {
  return Response.json({ error: 'リクエストの形式が正しくありません' }, { status: 400 })
}
