import { describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  delete (globalThis as { __presenterBroadcast?: unknown }).__presenterBroadcast
  return import('./broadcast')
}

describe('broadcast', () => {
  it('配信・取り下げを購読者に通知する', async () => {
    const { setBroadcast, clearBroadcast, subscribe, getBroadcast } = await load()
    const received: (string | null)[] = []
    subscribe(b => received.push(b ? b.title : null))
    const sent = setBroadcast({ title: '演習1', body: '本文' })
    expect(getBroadcast()).toEqual(sent)
    clearBroadcast()
    expect(received).toEqual(['演習1', null])
    expect(getBroadcast()).toBeNull()
  })

  it('購読解除後は通知しない', async () => {
    const { setBroadcast, subscribe, getSubscriberCount } = await load()
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)!
    unsubscribe()
    setBroadcast({ title: 't', body: 'b' })
    expect(listener).not.toHaveBeenCalled()
    expect(getSubscriberCount()).toBe(0)
  })

  it('同時購読数の上限を超えた購読は null を返す', async () => {
    const { subscribe, getSubscriberCount, MAX_SUBSCRIBERS } = await load()
    for (let i = 0; i < MAX_SUBSCRIBERS; i++) expect(subscribe(() => {})).not.toBeNull()
    expect(subscribe(() => {})).toBeNull()
    expect(getSubscriberCount()).toBe(MAX_SUBSCRIBERS)
  })
})
