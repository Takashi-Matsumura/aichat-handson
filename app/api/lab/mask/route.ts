// セキュリティ実験ラボ「マスキング可視化」体験用API。
// lib/analytics/masking.ts の maskText を、利用状況ログ保存時と全く同じロジックで
// そのまま呼び出す（別実装を用意すると本物の挙動とズレる可能性があるため）。

import { NextRequest } from 'next/server'
import { maskText } from '@/lib/analytics/masking'

export async function POST(request: NextRequest) {
  const { text } = await request.json()
  const result = maskText(String(text ?? ''))
  return Response.json(result)
}
