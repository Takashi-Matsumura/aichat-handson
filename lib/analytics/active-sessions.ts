// 「アクティブ利用セッション数」を数えるための、あえて非永続なセッション追跡。
//
// SQLite側(lib/analytics/db.ts)にはセッションIDを一切保存しない方針のため、
// 個人統計と紐付く可能性のあるこの値だけはインメモリ(サーバー再起動で消える)に留める。
// dev の HMR でモジュールが再評価されても消えないよう globalThis に固定して保持する。

type SessionMap = Map<string, Date>;

const globalForSessions = globalThis as unknown as { __activeSessions?: SessionMap };

const sessions: SessionMap =
  globalForSessions.__activeSessions ?? (globalForSessions.__activeSessions = new Map());

export function registerActiveSession(sessionId: string): void {
  sessions.set(sessionId, new Date());
}

export function getActiveSessionCount(from: Date, to: Date): number {
  let count = 0;
  for (const lastSeenAt of sessions.values()) {
    if (lastSeenAt >= from && lastSeenAt < to) count += 1;
  }
  return count;
}
