// AI利用ログの永続化先(SQLite)。
//
// このテーブルは会場全体の集計(/presenter の利用統計)のためだけに存在し、
// 個人を特定できる情報(プロンプト本文・応答本文・セッションID)は一切保存しない。
// 個人統計はブラウザ側(lib/personal-stats.ts)で完結させる設計のため。
//
// dev の HMR でモジュールが再評価されてもコネクションを開き直さないよう、
// 他のインメモリストア(lib/rag/store.ts等)と同様に globalThis に固定して保持する。

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.ANALYTICS_DB_PATH ?? path.join(process.cwd(), "data", "analytics.db");

function createDb(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_requests (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      estimated_cost REAL,
      latency_ms INTEGER,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL,
      business_category TEXT,
      usage_purpose TEXT,
      task_type TEXT,
      improvement_type TEXT,
      automation_potential TEXT,
      sensitivity_level TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at ON ai_requests(created_at);
  `);
  return db;
}

const globalForDb = globalThis as unknown as { __analyticsDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  return globalForDb.__analyticsDb ?? (globalForDb.__analyticsDb = createDb());
}
