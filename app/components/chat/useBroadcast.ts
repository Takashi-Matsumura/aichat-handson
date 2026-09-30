'use client'

import { useEffect, useState } from 'react'

export type Broadcast = { broadcastId: string; title: string; body: string }

const DISMISSED_KEY = 'handson-broadcast-dismissed'

// 講師からのプロンプト配信(/presenter「プロンプト配信」タブ)をリアルタイムに受け取る。
// SSEで受け取った最新1件のみ保持する。EventSourceはブラウザが自動再接続するため、
// 会場のWi-Fiが不安定でも復帰する。接続直後にサーバーが現在の状態を必ず1回送るので、
// 途中参加時も最新の配信状態に揃う。
export function useBroadcast() {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    const es = new EventSource('/api/broadcast/stream')
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        const next = data.broadcast ?? null
        setBroadcast(next)
        if (!next) {
          setModalOpen(false)
          return
        }
        // 既にこの配信を閉じたことがある(タブ内で既読)場合は自動で開き直さない。
        // それでも見返せるよう、入力欄付近の再表示ボタンは別途出す。
        const dismissedId = sessionStorage.getItem(DISMISSED_KEY)
        setModalOpen(dismissedId !== next.broadcastId)
      } catch {
        // 壊れたデータは無視する
      }
    }
    return () => es.close()
  }, [])

  function openModal() {
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    if (broadcast) {
      try {
        sessionStorage.setItem(DISMISSED_KEY, broadcast.broadcastId)
      } catch {
        // 容量超過などで保存できなくても、モーダルの再表示ボタンで代替できるため無視する
      }
    }
  }

  return { broadcast, modalOpen, openModal, closeModal }
}
