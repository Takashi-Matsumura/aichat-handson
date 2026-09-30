// 講師画面(/presenter)のログイン・ログアウト。
// パスワードは環境変数 PRESENTER_PASSWORD と照合し、成功時は HttpOnly Cookie を発行する。

import { cookies } from 'next/headers'
import {
  PRESENTER_COOKIE,
  PRESENTER_COOKIE_MAX_AGE,
  isPresenterAuthConfigured,
  isSameOriginRequest,
  issueSessionToken,
  verifyPassword,
} from '@/lib/presenter/auth'

// 総当たりを遅らせるため、失敗時は一定時間待ってから応答する。
const FAILURE_DELAY_MS = 1000

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: '不正なリクエスト元です' }, { status: 403 })
  }
  if (!isPresenterAuthConfigured()) {
    return Response.json(
      { error: '講師用パスワード(PRESENTER_PASSWORD)が設定されていません' },
      { status: 503 }
    )
  }
  const { password } = await request.json().catch(() => ({}))
  if (typeof password !== 'string' || !verifyPassword(password)) {
    await new Promise(resolve => setTimeout(resolve, FAILURE_DELAY_MS))
    return Response.json({ error: 'パスワードが違います' }, { status: 401 })
  }
  ;(await cookies()).set(PRESENTER_COOKIE, issueSessionToken()!, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: PRESENTER_COOKIE_MAX_AGE,
  })
  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: '不正なリクエスト元です' }, { status: 403 })
  }
  ;(await cookies()).delete(PRESENTER_COOKIE)
  return Response.json({ ok: true })
}
