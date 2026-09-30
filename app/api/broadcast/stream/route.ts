// 受講者のチャット画面(app/page.tsx)が講師からのプロンプト配信をリアルタイムに
// 受け取るためのSSEエンドポイント。受講者向けのため認証なし。同時接続数は
// lib/presenter/broadcast.ts の MAX_SUBSCRIBERS までに制限する。
//
// app/api/chat/route.ts と同じ text/event-stream の3ヘッダーを使う。接続直後に
// 現在の配信状態を必ず1回送るため、途中参加・再接続した受講者も自動で最新状態に揃う
// (「最新1件のみ」の配信なので取りこぼしの概念が無い)。EventSourceはブラウザが
// 自動再接続してくれるので、会場のWi-Fiが不安定でも復帰する。

import { getBroadcast, subscribe, type Broadcast } from '@/lib/presenter/broadcast'

export const dynamic = 'force-dynamic'

const PING_INTERVAL_MS = 25000
// ブラウザの EventSource が切断後に再接続するまでの待ち時間(SSEの retry フィールド)。
// 通常は短く、同時接続数の上限(MAX_SUBSCRIBERS)で断った接続にだけ長くして、再接続の嵐を避ける。
const NORMAL_RETRY_MS = 3000
const FULL_RETRY_MS = 30000

function encodeBroadcastEvent(broadcast: Broadcast | null, retryMs?: number): string {
  const retry = retryMs === undefined ? '' : `retry: ${retryMs}\n`
  return `${retry}data: ${JSON.stringify({ broadcast })}\n\n`
}

export async function GET() {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null

  function cleanup() {
    unsubscribe?.()
    unsubscribe = null
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = null
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // cancel() が呼ばれないまま閉じられた場合に備え、送信失敗時も購読とタイマーを片付ける。
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          cleanup()
        }
      }
      const unsub = subscribe(broadcast => send(encodeBroadcastEvent(broadcast)))
      if (!unsub) {
        // 上限に達している: 現在の配信内容だけ渡して切断する。EventSource は retry 後に
        // 自動で再接続するので、空きができれば通常どおり購読に戻る。
        send(encodeBroadcastEvent(getBroadcast(), FULL_RETRY_MS))
        controller.close()
        return
      }
      unsubscribe = unsub
      send(encodeBroadcastEvent(getBroadcast(), NORMAL_RETRY_MS))
      // プロキシ等による無通信タイムアウトでの切断を防ぐためのコメント行。
      pingTimer = setInterval(() => send(': ping\n\n'), PING_INTERVAL_MS)
    },
    cancel() {
      cleanup()
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
