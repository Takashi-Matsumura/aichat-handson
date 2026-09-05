// 受講者のチャット画面(app/page.tsx)が講師からのプロンプト配信をリアルタイムに
// 受け取るためのSSEエンドポイント。認証なし(このアプリ全体の方針)。
//
// app/api/chat/route.ts と同じ text/event-stream の3ヘッダーを使う。接続直後に
// 現在の配信状態を必ず1回送るため、途中参加・再接続した受講者も自動で最新状態に揃う
// (「最新1件のみ」の配信なので取りこぼしの概念が無い)。EventSourceはブラウザが
// 自動再接続してくれるので、会場のWi-Fiが不安定でも復帰する。

import { getBroadcast, subscribe, type Broadcast } from '@/lib/presenter/broadcast'

export const dynamic = 'force-dynamic'

const PING_INTERVAL_MS = 25000

function encodeBroadcastEvent(broadcast: Broadcast | null): string {
  return `data: ${JSON.stringify({ broadcast })}\n\n`
}

export async function GET() {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(encodeBroadcastEvent(getBroadcast())))
      unsubscribe = subscribe(broadcast => {
        controller.enqueue(encoder.encode(encodeBroadcastEvent(broadcast)))
      })
      // プロキシ等による無通信タイムアウトでの切断を防ぐためのコメント行。
      pingTimer = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'))
      }, PING_INTERVAL_MS)
    },
    cancel() {
      unsubscribe?.()
      if (pingTimer) clearInterval(pingTimer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
