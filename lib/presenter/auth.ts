// 講師(/presenter)用の簡易認証。
//
// 受講者はログイン無しのままにしつつ、管理系API(/api/admin/*)と講師画面だけは
// 環境変数 PRESENTER_PASSWORD を知っている人に限定する。セッションストアを持たず、
// Cookieには「パスワードから導出したHMAC」を入れる(パスワードを変えれば全セッションが失効する)。
// PRESENTER_PASSWORD が未設定の場合は安全側に倒し、管理系APIはすべて拒否する。

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export const PRESENTER_COOKIE = 'presenter_auth'
export const PRESENTER_COOKIE_MAX_AGE = 60 * 60 * 12

function getPassword(): string | null {
  const password = process.env.PRESENTER_PASSWORD
  return password ? password : null
}

export function isPresenterAuthConfigured(): boolean {
  return getPassword() !== null
}

function sessionToken(password: string): string {
  return createHmac('sha256', password).update('presenter-session-v1').digest('hex')
}

// 長さの違いで比較時間が変わらないよう、両辺をハッシュして固定長にしてから比較する。
function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest()
  const hb = createHmac('sha256', 'cmp').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export function verifyPassword(input: string): boolean {
  const password = getPassword()
  return password !== null && safeEqual(input, password)
}

// ログイン成功時にCookieへ入れる値。
export function issueSessionToken(): string | null {
  const password = getPassword()
  return password ? sessionToken(password) : null
}

export async function isPresenterAuthenticated(): Promise<boolean> {
  const password = getPassword()
  if (!password) return false
  const value = (await cookies()).get(PRESENTER_COOKIE)?.value
  return value !== undefined && safeEqual(value, sessionToken(password))
}

// 状態を変更するリクエストが同一オリジンのページから来たことを確認する(CSRF対策)。
// request.json() はContent-Typeを見ないため、外部サイトの <form enctype="text/plain"> 等からも
// JSONとして解釈できるボディを送れてしまう。ブラウザはPOST/PUT/DELETEに必ずOriginを付けるので、
// Originが無い・Hostと一致しないものは拒否する。
export function isSameOriginRequest(request: Request): boolean {
  const method = request.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') return true
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

// 管理系APIの各ハンドラ冒頭で呼ぶ。拒否すべき場合はそのまま返すResponseを、通してよければnullを返す。
export async function requirePresenter(request: Request): Promise<Response | null> {
  if (!isPresenterAuthConfigured()) {
    return Response.json(
      { error: '講師用パスワード(PRESENTER_PASSWORD)が設定されていないため、管理機能は無効です' },
      { status: 503 }
    )
  }
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: '不正なリクエスト元です' }, { status: 403 })
  }
  if (!(await isPresenterAuthenticated())) {
    return Response.json({ error: '講師としてログインしてください' }, { status: 401 })
  }
  return null
}
