// 講師画面(/presenter)のログイン・ログアウト。
// パスワードは環境変数 PRESENTER_PASSWORD と照合し、成功時は HttpOnly Cookie を発行する。

import { cookies } from 'next/headers'
import {
  PRESENTER_COOKIE,
  PRESENTER_COOKIE_MAX_AGE,
  isPresenterAuthConfigured,
  MIN_PASSWORD_LENGTH,
  isSameOriginRequest,
  issueSessionToken,
  takeLoginAttempt,
  verifyPassword,
} from '@/lib/presenter/auth'
import { readJsonObject } from '@/lib/http/json'

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: '不正なリクエスト元です' }, { status: 403 })
  }
  if (!isPresenterAuthConfigured()) {
    return Response.json(
      { error: `講師用パスワード(PRESENTER_PASSWORD)が未設定か${MIN_PASSWORD_LENGTH}文字未満です` },
      { status: 503 }
    )
  }
  // 総当たり対策。サーバー全体で試行回数を制限する(lib/presenter/auth.ts の takeLoginAttempt)。
  if (!takeLoginAttempt()) {
    return Response.json(
      { error: 'ログインの試行が多すぎます。しばらく待ってから再度お試しください。' },
      { status: 429, headers: { 'Retry-After': '5' } }
    )
  }
  const { password } = (await readJsonObject(request)) ?? {}
  if (typeof password !== 'string' || !verifyPassword(password)) {
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
