import { describe, expect, it } from 'vitest'
import { QueueFullError, createLimiter } from './limiter'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('createLimiter', () => {
  it('同時実行数を limit に抑え、終わったら次を開始する', async () => {
    const limiter = createLimiter(1, 10)
    const first = deferred()
    const started: string[] = []

    const a = limiter.run(async () => {
      started.push('a')
      await first.promise
    })
    const b = limiter.run(async () => {
      started.push('b')
    })
    await Promise.resolve()
    expect(started).toEqual(['a'])

    first.resolve()
    await Promise.all([a, b])
    expect(started).toEqual(['a', 'b'])
  })

  it('待ち行列があふれたら QueueFullError', async () => {
    const limiter = createLimiter(1, 1)
    const block = deferred()
    const a = limiter.run(() => block.promise)
    const b = limiter.run(async () => {})
    await expect(limiter.run(async () => {})).rejects.toBeInstanceOf(QueueFullError)
    block.resolve()
    await Promise.all([a, b])
  })

  it('待機中に中断されたら行列から外れ、タスクは実行されない', async () => {
    const limiter = createLimiter(1, 10)
    const block = deferred()
    const a = limiter.run(() => block.promise)
    const ac = new AbortController()
    let ran = false
    const b = limiter.run(async () => {
      ran = true
    }, ac.signal)
    ac.abort()
    await expect(b).rejects.toBeDefined()

    block.resolve()
    await a
    // 中断されたタスクの枠が残っていないこと(次のタスクがすぐ走る)
    await limiter.run(async () => {})
    expect(ran).toBe(false)
  })
})
