// /presenter の「プロンプト配信」タブから、現在の配信状態を取得・開始・取り下げする。
// admin/model-lock 等と同様に認証は行わない（このアプリ全体の方針）。

import { clearBroadcast, getBroadcast, getSubscriberCount, setBroadcast } from '@/lib/presenter/broadcast'
import { getPrompt } from '@/lib/presenter/prompts'

export async function GET() {
  return Response.json({ broadcast: getBroadcast(), subscriberCount: getSubscriberCount() })
}

export async function POST(request: Request) {
  const { promptId } = await request.json()
  if (typeof promptId !== 'string') {
    return Response.json({ error: 'promptIdが必要です' }, { status: 400 })
  }
  const prompt = await getPrompt(promptId)
  if (!prompt) {
    return Response.json({ error: 'プロンプトが見つかりません' }, { status: 404 })
  }
  const broadcast = setBroadcast({ title: prompt.title, body: prompt.body })
  return Response.json({ broadcast, subscriberCount: getSubscriberCount() })
}

export async function DELETE() {
  clearBroadcast()
  return Response.json({ broadcast: null, subscriberCount: getSubscriberCount() })
}
