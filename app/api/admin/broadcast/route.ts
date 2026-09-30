// /presenter の「プロンプト配信」タブから、現在の配信状態を取得・開始・取り下げする。
// 講師のみ利用できる(lib/presenter/auth.ts の requirePresenter)。

import { clearBroadcast, getBroadcast, getSubscriberCount, setBroadcast } from '@/lib/presenter/broadcast'
import { getPrompt } from '@/lib/presenter/prompts'
import { requirePresenter } from '@/lib/presenter/auth'

export async function GET(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  return Response.json({ broadcast: getBroadcast(), subscriberCount: getSubscriberCount() })
}

export async function POST(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
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

export async function DELETE(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  clearBroadcast()
  return Response.json({ broadcast: null, subscriberCount: getSubscriberCount() })
}
