import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// auth.ts はモジュール読み込み時の globalThis と process.env を参照するため、テストごとに読み込み直す。
async function loadAuth(password?: string) {
  vi.resetModules()
  delete (globalThis as { __presenterLoginThrottle?: unknown }).__presenterLoginThrottle
  if (password === undefined) vi.stubEnv('PRESENTER_PASSWORD', '')
  else vi.stubEnv('PRESENTER_PASSWORD', password)
  return import('./auth')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('パスワード設定', () => {
  it.each([
    ['未設定', undefined, false],
    ['11文字', 'short-11chr', false],
    ['12文字', 'exactly12chr', true],
  ])('%sなら管理機能の有効=%s', async (_, password, expected) => {
    const auth = await loadAuth(password)
    expect(auth.isPresenterAuthConfigured()).toBe(expected)
  })

  it('正しいパスワードだけを受け付ける', async () => {
    const auth = await loadAuth('correct-horse-battery')
    expect(auth.verifyPassword('correct-horse-battery')).toBe(true)
    expect(auth.verifyPassword('correct-horse-batter')).toBe(false)
    expect(auth.verifyPassword('')).toBe(false)
  })
})

describe('isSameOriginRequest', () => {
  const req = (method: string, headers: Record<string, string>) =>
    new Request('http://localhost:3000/api/admin/x', { method, headers })

  it('GET は Origin なしでも通す', async () => {
    const { isSameOriginRequest } = await loadAuth()
    expect(isSameOriginRequest(req('GET', {}))).toBe(true)
  })

  it('変更系は Origin と Host が一致するときだけ通す', async () => {
    const { isSameOriginRequest } = await loadAuth()
    expect(isSameOriginRequest(req('POST', { origin: 'http://localhost:3000', host: 'localhost:3000' }))).toBe(true)
    expect(isSameOriginRequest(req('POST', { origin: 'http://evil.example', host: 'localhost:3000' }))).toBe(false)
    expect(isSameOriginRequest(req('DELETE', { host: 'localhost:3000' }))).toBe(false)
    expect(isSameOriginRequest(req('PUT', { origin: 'not a url', host: 'localhost:3000' }))).toBe(false)
  })
})

describe('takeLoginAttempt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
  })

  it('連続5回までは通し、6回目は拒否する', async () => {
    const { takeLoginAttempt } = await loadAuth('correct-horse-battery')
    const results = Array.from({ length: 6 }, () => takeLoginAttempt())
    expect(results).toEqual([true, true, true, true, true, false])
  })

  it('1秒ごとに1回分回復する', async () => {
    const { takeLoginAttempt } = await loadAuth('correct-horse-battery')
    for (let i = 0; i < 5; i++) takeLoginAttempt()
    expect(takeLoginAttempt()).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(takeLoginAttempt()).toBe(true)
    expect(takeLoginAttempt()).toBe(false)
  })
})
