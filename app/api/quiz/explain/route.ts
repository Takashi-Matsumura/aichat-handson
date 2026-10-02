import { invalidJsonResponse, readJsonObject } from '@/lib/http/json'
import { isSameOriginRequest } from '@/lib/presenter/auth'
import { parseExplainRequest, type ExplainStreamEvent } from '@/lib/quiz/explain'
import { loadExplainSource, streamExplanation } from '@/lib/quiz/explain-generate'
import { QueueFullError, explainLimiter } from '@/lib/quiz/limiter'

// 順番待ちを含めた上限時間。説明は短いので、問題生成(QUIZ_TIMEOUT_MS)より短くしている。
const TIMEOUT_MS = 60_000

const FAILED_MESSAGE = 'AIによる説明の作成に失敗しました。少し時間をおいてから、もう一度お試しください。'

// 確認テストの解説への追加説明(「もう少し簡単に説明」「例題」)を作り、ストリーミング(NDJSON)で返す。
// 受講者向けなので認証はしないが、LLMのスロットを消費する操作のため、他サイトからの呼び出しは弾く。
// 問題はサーバーに保存していないので、問題の内容はブラウザから送り直してもらい、ここで検証する。
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: '不正なリクエスト元です' }, { status: 403 })
  }
  const req = parseExplainRequest(await readJsonObject(request))
  if (!req) return invalidJsonResponse()
  const source = await loadExplainSource(req)
  if (!source) return invalidJsonResponse()

  // 受講者が次の問題へ進んだら(request.signal / ストリームのキャンセル)、順番待ちも生成も打ち切ってスロットを空ける。
  const cancel = new AbortController()
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const signal = AbortSignal.any([request.signal, cancel.signal, timeout])
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ExplainStreamEvent) => {
        if (!signal.aborted || timeout.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }
      try {
        await explainLimiter.run(() => streamExplanation(req, source, (text) => send({ type: 'delta', text }), signal), signal)
        send({ type: 'done' })
      } catch (err) {
        if (err instanceof QueueFullError) {
          send({ type: 'error', message: '追加の説明が混み合っています。少し時間をおいてから、もう一度お試しください。' })
        } else if (timeout.aborted) {
          send({ type: 'error', message: '説明の作成に時間がかかりすぎたため中断しました。もう一度お試しください。' })
        } else if (!signal.aborted) {
          console.error('[quiz] explanation failed:', err)
          send({ type: 'error', message: FAILED_MESSAGE })
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
      'X-Accel-Buffering': 'no',
    },
  })
}
