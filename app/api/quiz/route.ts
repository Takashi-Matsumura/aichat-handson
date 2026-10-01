import { isSameOriginRequest } from '@/lib/presenter/auth'
import { generateQuiz } from '@/lib/quiz/generate'
import { QueueFullError, quizLimiter } from '@/lib/quiz/limiter'

// 順番待ちを含めた生成全体の上限時間。これを過ぎたら諦めてエラーを返す。
const TIMEOUT_MS = Number(process.env.QUIZ_TIMEOUT_MS ?? 180_000)

// 確認テストを1回分(10問)生成して返す。受講者向けなので認証はしないが、
// LLMのスロットを消費する操作のため、他サイトからの呼び出し(CSRF的な濫用)は弾く。
// 結果はサーバーに保存しない(採点・履歴は受講者のブラウザ側で行う)。
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: '不正なリクエスト元です' }, { status: 403 })
  }

  // 受講者が画面を離れたら(request.signal)、順番待ちも生成も打ち切ってスロットを空ける。
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])
  try {
    const quiz = await quizLimiter.run(() => generateQuiz(signal), signal)
    return Response.json(quiz)
  } catch (err) {
    if (err instanceof QueueFullError) {
      return Response.json({ error: err.message }, { status: 429 })
    }
    if (signal.aborted && !request.signal.aborted) {
      return Response.json({ error: '問題の生成に時間がかかりすぎたため中断しました。もう一度お試しください。' }, { status: 503 })
    }
    console.error('[quiz] generation failed:', err)
    return Response.json(
      { error: 'AIによる問題の生成に失敗しました。少し時間をおいてから、もう一度お試しください。' },
      { status: 503 },
    )
  }
}
