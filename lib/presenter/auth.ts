// 講師(/presenter)用の簡易認証。
//
// 受講者はログイン無しのままにしつつ、管理系API(/api/admin/*)と講師画面だけは
// 環境変数 PRESENTER_PASSWORD を知っている人に限定する。セッションストアを持たず、
// Cookieには「パスワードから導出したHMAC」を入れる(パスワードを変えれば全セッションが失効する)。
// PRESENTER_PASSWORD が未設定または短すぎる場合は安全側に倒し、管理系APIはすべて拒否する。

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export const PRESENTER_COOKIE = 'presenter_auth'
export const PRESENTER_COOKIE_MAX_AGE = 60 * 60 * 12

// ログイン試行はサーバー全体で毎秒1回程度に制限している(下の takeLoginAttempt)が、
// 短いパスワードではそれでも総当たりが現実的になるため、この長さ未満は設定として受け付けない。
export const MIN_PASSWORD_LENGTH = 12

function getPassword(): string | null {
  const password = process.env.PRESENTER_PASSWORD
  return password && password.length >= MIN_PASSWORD_LENGTH ? password : null
}

// ログイン試行の回数制限(トークンバケット)。
// 接続元IPごとに数えたいが、Next.js は X-Forwarded-For が既に付いていればそれを信用するため
// (next/dist/server/base-server.js)、IPはクライアントが自由に偽装できる。そこでサーバー全体で
// 「平均毎秒1回・連続5回まで」に制限する。講師本人は通常ログイン済み(Cookie有効12時間)なので、
// 攻撃中にログインしづらくなる副作用は許容する。
const LOGIN_BURST = 5
const LOGIN_REFILL_INTERVAL_MS = 1000

const globalForThrottle = globalThis as unknown as {
  __presenterLoginThrottle?: { tokens: number; updatedAt: number }
}
const throttle =
  globalForThrottle.__presenterLoginThrottle ??
  (globalForThrottle.__presenterLoginThrottle = { tokens: LOGIN_BURST, updatedAt: Date.now() })

// 試行してよければ true を返し、1回分を消費する。
export function takeLoginAttempt(): boolean {
  const now = Date.now()
  const refilled = (now - throttle.updatedAt) / LOGIN_REFILL_INTERVAL_MS
  throttle.tokens = Math.min(LOGIN_BURST, throttle.tokens + refilled)
  throttle.updatedAt = now
  if (throttle.tokens < 1) return false
  throttle.tokens -= 1
  return true
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
      { error: `講師用パスワード(PRESENTER_PASSWORD)が未設定か${MIN_PASSWORD_LENGTH}文字未満のため、管理機能は無効です` },
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
