import { beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  delete (globalThis as { __activeSessions?: unknown }).__activeSessions
  return import('./active-sessions')
}

describe('active-sessions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
  })

  it('期間内に使われたセッションを数える', async () => {
    const { registerActiveSession, getActiveSessionCount } = await load()
    registerActiveSession('a')
    registerActiveSession('b')
    registerActiveSession('a')
    const now = Date.now()
    expect(getActiveSessionCount(new Date(now - 1000), new Date(now + 1000))).toBe(2)
    expect(getActiveSessionCount(new Date(now + 1000), new Date(now + 2000))).toBe(0)
  })

  it('保持数は10,000件で頭打ちになり、最も長く使われていないものから捨てる', async () => {
    const { registerActiveSession, getActiveSessionCount } = await load()
    for (let i = 0; i < 10_000; i++) registerActiveSession(`s${i}`)
    vi.advanceTimersByTime(1000)
    registerActiveSession('s0') // 最古だった s0 を使い直すと、次に古い s1 が捨てられる
    registerActiveSession('new')
    const all = getActiveSessionCount(new Date(0), new Date(Date.now() + 1))
    expect(all).toBe(10_000)
    const recent = getActiveSessionCount(new Date(Date.now()), new Date(Date.now() + 1))
    expect(recent).toBe(2) // s0 と new
  })
})
