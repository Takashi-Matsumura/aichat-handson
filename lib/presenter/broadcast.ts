// 「今なにを配信中か」という一時的な状態と、SSE購読者(受講者のブラウザ)への通知を扱う。
//
// lib/settings/store.ts と同じ方針: プロンプトのリスト(lib/presenter/prompts.ts)と違い
// これはセッション限りの状態なので、DB/ファイルには保存せずサーバープロセスのメモリに
// 保持するだけにする(再起動でクリアされて構わない)。dev の HMR でモジュールが再評価
// されてもデータが消えないよう、globalThis に固定して保持する。

export type Broadcast = {
  broadcastId: string
  title: string
  body: string
  sentAt: string
}

type Listener = (broadcast: Broadcast | null) => void

type BroadcastState = {
  current: Broadcast | null
  listeners: Set<Listener>
}

const globalForBroadcast = globalThis as unknown as { __presenterBroadcast?: BroadcastState }

const state: BroadcastState =
  globalForBroadcast.__presenterBroadcast ??
  (globalForBroadcast.__presenterBroadcast = { current: null, listeners: new Set() })

export function getBroadcast(): Broadcast | null {
  return state.current
}

// 配信時点のタイトル・本文をスナップショットとして保持する。配信後に講師がリスト側の
// プロンプトを編集しても、既に配信済みの内容が受講者側で勝手に書き換わらないようにするため。
export function setBroadcast(input: { title: string; body: string }): Broadcast {
  const broadcast: Broadcast = {
    broadcastId: crypto.randomUUID(),
    title: input.title,
    body: input.body,
    sentAt: new Date().toISOString(),
  }
  state.current = broadcast
  notify()
  return broadcast
}

export function clearBroadcast(): void {
  state.current = null
  notify()
}

function notify(): void {
  for (const listener of state.listeners) listener(state.current)
}

export function subscribe(listener: Listener): () => void {
  state.listeners.add(listener)
  return () => {
    state.listeners.delete(listener)
  }
}

export function getSubscriberCount(): number {
  return state.listeners.size
}
