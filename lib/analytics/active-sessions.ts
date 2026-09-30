// 「アクティブ利用セッション数」を数えるための、あえて非永続なセッション追跡。
//
// SQLite側(lib/analytics/db.ts)にはセッションIDを一切保存しない方針のため、
// 個人統計と紐付く可能性のあるこの値だけはインメモリ(サーバー再起動で消える)に留める。
// dev の HMR でモジュールが再評価されても消えないよう globalThis に固定して保持する。

type SessionMap = Map<string, Date>;

// 保持するセッション数の上限。会場規模(数十〜数百人)に対して十分大きく、
// Cookieを差し替えながら大量にリクエストされてもメモリが際限なく増えないようにする。
const MAX_SESSIONS = 10_000;

const globalForSessions = globalThis as unknown as { __activeSessions?: SessionMap };

const sessions: SessionMap =
  globalForSessions.__activeSessions ?? (globalForSessions.__activeSessions = new Map());

// Mapは挿入順を保つので、削除してから入れ直すと「最後に使われた順」に並ぶ。
// 上限を超えたら最も長く使われていないものから捨てる。
export function registerActiveSession(sessionId: string): void {
  sessions.delete(sessionId);
  sessions.set(sessionId, new Date());
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

export function getActiveSessionCount(from: Date, to: Date): number {
  let count = 0;
  for (const lastSeenAt of sessions.values()) {
    if (lastSeenAt >= from && lastSeenAt < to) count += 1;
  }
  return count;
}
