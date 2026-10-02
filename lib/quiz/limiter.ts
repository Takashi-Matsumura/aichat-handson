// 確認テスト生成の同時実行数を絞るための簡易セマフォ(プロセス内メモリ)。
//
// 受講者が一斉に「確認テスト」を押すと、1人あたり複数の生成リクエストが llama-server に並び、
// チャット用のスロットまで長時間ふさいでしまう。そこで同時に生成する人数を limit 人に絞り、
// 残りは順番待ちさせる。待ち行列が maxQueue を超えたら受け付けずに「混雑中」を返す。
// dev の HMR でモジュールが再評価されても状態が分裂しないよう、globalThis に固定して保持する。

export class QueueFullError extends Error {
  constructor() {
    super('確認テストの生成が混み合っています。少し時間をおいてから、もう一度お試しください。')
  }
}

export type Limiter = {
  run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T>
}

export function createLimiter(limit: number, maxQueue: number): Limiter {
  let active = 0
  const waiting: (() => void)[] = []

  const release = () => {
    active--
    const next = waiting.shift()
    if (next) next()
  }

  const acquire = (signal?: AbortSignal): Promise<void> => {
    if (active < limit) {
      active++
      return Promise.resolve()
    }
    if (waiting.length >= maxQueue) return Promise.reject(new QueueFullError())
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const i = waiting.indexOf(start)
        if (i >= 0) waiting.splice(i, 1)
        reject(signal?.reason ?? new Error('aborted'))
      }
      // release() から呼ばれた時点で枠を引き継ぐ。
      const start = () => {
        signal?.removeEventListener('abort', onAbort)
        active++
        resolve()
      }
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })
      waiting.push(start)
    })
  }

  return {
    async run(task, signal) {
      await acquire(signal)
      try {
        return await task()
      } finally {
        release()
      }
    },
  }
}

const globalForQuiz = globalThis as unknown as { __quizLimiter?: Limiter; __quizExplainLimiter?: Limiter }

const MAX_QUEUE = Math.max(0, Number(process.env.QUIZ_MAX_QUEUE ?? 60))

export const quizLimiter: Limiter =
  globalForQuiz.__quizLimiter ??
  (globalForQuiz.__quizLimiter = createLimiter(Math.max(1, Number(process.env.QUIZ_MAX_CONCURRENT ?? 1)), MAX_QUEUE))

// 追加説明(/api/quiz/explain)用。問題生成の枠は1回分の生成が終わるまで空かないので、
// 同じ枠を使うと、受講者自身の「残りの問題の生成」が終わるまで追加説明が待たされてしまう。
// 追加説明は1回が短いので、別枠にして同時実行数だけを絞る。
export const explainLimiter: Limiter =
  globalForQuiz.__quizExplainLimiter ??
  (globalForQuiz.__quizExplainLimiter = createLimiter(Math.max(1, Number(process.env.QUIZ_EXPLAIN_MAX_CONCURRENT ?? 2)), MAX_QUEUE))
