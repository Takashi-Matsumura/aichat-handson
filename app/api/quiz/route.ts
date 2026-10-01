import { isSameOriginRequest } from '@/lib/presenter/auth'
import { generateQuiz } from '@/lib/quiz/generate'
import { QueueFullError, quizLimiter } from '@/lib/quiz/limiter'
import { QUIZ_TOTAL_QUESTIONS, type QuizStreamEvent } from '@/lib/quiz/schema'

// 順番待ちを含めた生成全体の上限時間。過ぎたらそこまでに作れた問題で打ち切る。
const TIMEOUT_MS = Number(process.env.QUIZ_TIMEOUT_MS ?? 180_000)

// 確認テストを1回分生成し、できた問題から順にストリーミング(NDJSON)で返す。
// 受講者向けなので認証はしないが、LLMのスロットを消費する操作のため、他サイトからの呼び出しは弾く。
// 結果はサーバーに保存しない(採点・履歴は受講者のブラウザ側で行う)。
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: '不正なリクエスト元です' }, { status: 403 })
  }

  // 受講者が画面を離れたら(request.signal / ストリームのキャンセル)、順番待ちも生成も打ち切ってスロットを空ける。
  const cancel = new AbortController()
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const signal = AbortSignal.any([request.signal, cancel.signal, timeout])
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: QuizStreamEvent) => {
        if (!signal.aborted || timeout.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }
      try {
        send({ type: 'start', total: QUIZ_TOTAL_QUESTIONS })
        const { count, errors } = await quizLimiter.run(
          () => generateQuiz((item) => send({ type: 'question', item }), signal),
          signal,
        )
        if (errors.length > 0) console.error('[quiz] generation incomplete:', errors)
        if (count > 0) {
          send({ type: 'done', count })
        } else {
          send({
            type: 'error',
            message: timeout.aborted
              ? '問題の生成に時間がかかりすぎたため中断しました。もう一度お試しください。'
              : 'AIによる問題の生成に失敗しました。少し時間をおいてから、もう一度お試しください。',
          })
        }
      } catch (err) {
        if (err instanceof QueueFullError) {
          send({ type: 'error', message: err.message })
        } else if (timeout.aborted) {
          send({ type: 'error', message: '順番待ちが長いため中断しました。少し時間をおいてから、もう一度お試しください。' })
        } else if (!signal.aborted) {
          console.error('[quiz] generation failed:', err)
          send({ type: 'error', message: 'AIによる問題の生成に失敗しました。少し時間をおいてから、もう一度お試しください。' })
        }
      } finally {
        try {
          controller.close()
        } catch {
          // 受講者側が先に切断していれば close 済み
        }
      }
    },
    cancel() {
      cancel.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
