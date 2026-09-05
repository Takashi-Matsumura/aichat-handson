// 研修参加者向け「個人統計」の保存先。
//
// サーバー(SQLite)には個人・セッションに紐づく利用実績を一切保存しない方針のため、
// チャットAPIが1回のやり取りごとに返す実績値(lib/analytics/route.ts の handson_stats)を
// このモジュールでブラウザの localStorage に積み上げる。ブラウザを閉じたりストレージを
// 消したりすれば消える、意図的に非永続なデータ。

const STORAGE_KEY = 'handson-personal-stats'

export type PersonalModelStat = {
  requestCount: number
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  latencySumMs: number
  latencyCount: number
}

export type PersonalStats = {
  requestCount: number
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  latencySumMs: number
  latencyCount: number
  models: Record<string, PersonalModelStat>
}

export type PersonalStatInput = {
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  latencyMs: number
}

function emptyStats(): PersonalStats {
  return { requestCount: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0, latencySumMs: 0, latencyCount: 0, models: {} }
}

export function loadPersonalStats(): PersonalStats | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PersonalStats) : null
  } catch {
    return null
  }
}

export function recordPersonalStat(input: PersonalStatInput): void {
  try {
    const stats = loadPersonalStats() ?? emptyStats()
    stats.requestCount += 1
    stats.inputTokens += input.inputTokens
    stats.outputTokens += input.outputTokens
    stats.estimatedCost += input.estimatedCost
    stats.latencySumMs += input.latencyMs
    stats.latencyCount += 1

    const model = stats.models[input.model] ?? { requestCount: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0, latencySumMs: 0, latencyCount: 0 }
    model.requestCount += 1
    model.inputTokens += input.inputTokens
    model.outputTokens += input.outputTokens
    model.estimatedCost += input.estimatedCost
    model.latencySumMs += input.latencyMs
    model.latencyCount += 1
    stats.models[input.model] = model

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {
    // localStorageが使えない環境(プライベートブラウズ等)でも致命的ではないため無視する。
  }
}
