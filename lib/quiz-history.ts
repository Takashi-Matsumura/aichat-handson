// 確認テストの成績履歴の保存先。
//
// lib/personal-stats.ts と同じ方針: サーバーには個人の成績を一切保存せず、受講者のブラウザの
// localStorage にだけ残す。保存するのは日時と点数のみで、問題文や回答内容は保存しない。

const STORAGE_KEY = 'handson-quiz-history'
const MAX_ENTRIES = 20

export type QuizPageScore = { pageId: number; title: string; correct: number; total: number }

export type QuizHistoryEntry = {
  at: string // ISO 8601
  correct: number
  total: number
  pages: QuizPageScore[]
}

// 新しい順に返す。
export function loadQuizHistory(): QuizHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as QuizHistoryEntry[]) : []
  } catch {
    return []
  }
}

export function recordQuizResult(entry: QuizHistoryEntry): void {
  try {
    const history = [entry, ...loadQuizHistory()].slice(0, MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {
    // localStorageが使えない環境(プライベートブラウズ等)でも致命的ではないため無視する。
  }
}
