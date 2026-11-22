// アプリと一緒に動かす周辺サービス(Dockerコンテナ)の稼働状況。/analytics の表示に使う。
// URL などの構成情報は返さず、状態だけを返す(受講者も見る画面のため)。

import { WEB_SEARCH_CONFIG } from '@/lib/web/config'

export type ServiceState = 'online' | 'offline' | 'unconfigured'

export type ServiceStatus = {
  key: 'searxng' | 'voicevox'
  label: string
  description: string
  state: ServiceState
}

// VOICEVOX はこのアプリでは使っていないが、同じマシンで研修用に動かすことがあるため状態だけ表示する。
// 空にすると「未設定」として表示する。
const VOICEVOX_URL = (process.env.VOICEVOX_URL ?? 'http://localhost:50021').replace(/\/+$/, '')

const CHECK_TIMEOUT_MS = 3000
// 画面を開いている受講者全員が定期的に問い合わせるため、短時間だけ結果を使い回す。
const CACHE_TTL_MS = 10_000
const cache = new Map<string, { ok: boolean; at: number }>()

async function isHttpOk(url: string): Promise<boolean> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ok
  let ok = false
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), cache: 'no-store' })
    ok = res.ok
    await res.body?.cancel()
  } catch {
    ok = false
  }
  cache.set(url, { ok, at: Date.now() })
  return ok
}

async function stateOf(baseUrl: string, path: string): Promise<ServiceState> {
  if (!baseUrl) return 'unconfigured'
  return (await isHttpOk(`${baseUrl}${path}`)) ? 'online' : 'offline'
}

export async function getServiceStatuses(): Promise<ServiceStatus[]> {
  const [searxng, voicevox] = await Promise.all([
    stateOf(WEB_SEARCH_CONFIG.searxngUrl, '/healthz'),
    stateOf(VOICEVOX_URL, '/version'),
  ])
  return [
    { key: 'searxng', label: 'SearXNG', description: 'Web検索（インターネット情報を使った回答）', state: searxng },
    { key: 'voicevox', label: 'VOICEVOX', description: '音声合成（このアプリでは未使用）', state: voicevox },
  ]
}
