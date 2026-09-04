// AI利用ログのインメモリストア。
//
// ai-usalysis-demo は PostgreSQL + Prisma に永続化するが、このハンズオン版はDBを持たない。
// 代わりに Next.js サーバープロセスのメモリ内にため込むだけにする（サーバー再起動で消えてよい）。
// dev の HMR でモジュールが再評価されてもデータが消えないよう、globalThis に固定して保持する。

import { CLASSIFICATION_DIMENSIONS } from "./categories";

export type ClassificationResult = {
  business_category: string;
  usage_purpose: string;
  task_type: string;
  improvement_type: string;
  automation_potential: string;
  rag_candidate: boolean;
  sensitivity_level: string;
  confidence: number;
};

export type AiRequestRecord = {
  id: string;
  sessionId: string;
  provider: string;
  model: string;
  promptMasked: string;
  responseMasked?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  latencyMs?: number;
  status: "success" | "error";
  errorMessage?: string;
  createdAt: Date;
  classification?: ClassificationResult;
};

type Store = {
  requests: AiRequestRecord[];
  sessions: Set<string>;
  seeded: boolean;
};

const globalForStore = globalThis as unknown as { __aiAnalyticsStore?: Store };

export const store: Store =
  globalForStore.__aiAnalyticsStore ??
  (globalForStore.__aiAnalyticsStore = { requests: [], sessions: new Set(), seeded: false });

export function registerSession(sessionId: string): void {
  store.sessions.add(sessionId);
}

export function addRequest(record: AiRequestRecord): void {
  ensureSeeded();
  store.sessions.add(record.sessionId);
  store.requests.push(record);
}

/** 分類が非同期(after())で完了した後、対応レコードへ結果を書き戻す。 */
export function attachClassification(requestId: string, classification: ClassificationResult): void {
  const record = store.requests.find((r) => r.id === requestId);
  if (record) record.classification = classification;
}

export function getAllRequests(): AiRequestRecord[] {
  ensureSeeded();
  return store.requests;
}

// ---------------------------------------------------------------------------
// デモ用シード: サーバー起動直後から /analytics に何か表示されるよう、
// 初回アクセス時に擬似的な利用ログを投入する。SEED_ANALYTICS=0 で無効化できる。

function ensureSeeded(): void {
  if (store.seeded) return;
  store.seeded = true;
  if (process.env.SEED_ANALYTICS === "0") return;

  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const now = Date.now();
  const seedSessions = ["seed-session-1", "seed-session-2", "seed-session-3"];

  const prompts = [
    "議事録のフォーマットを整えて要約してください",
    "このエラーログの原因を調べてください",
    "見積書のテンプレートを作成してください",
    "顧客からの問い合わせメールへの返信文を考えてください",
    "研修資料のアイデアを3つ出してください",
    "この関数をリファクタリングしてください",
    "月次売上データの傾向を分析してください",
    "社内規定の該当箇所を教えてください",
  ];

  for (let i = 0; i < 18; i++) {
    const daysAgo = Math.floor(Math.random() * 14);
    const createdAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000 - Math.floor(Math.random() * 12) * 60 * 60 * 1000);
    const inputTokens = 40 + Math.floor(Math.random() * 200);
    const outputTokens = 80 + Math.floor(Math.random() * 400);

    store.requests.push({
      id: `seed-${i}`,
      sessionId: pick(seedSessions),
      provider: "local-llama-cpp",
      model: "gemma4",
      promptMasked: pick(prompts),
      responseMasked: "（デモ用の擬似応答）",
      inputTokens,
      outputTokens,
      latencyMs: 800 + Math.floor(Math.random() * 3000),
      status: "success",
      createdAt,
      classification: {
        business_category: pick(CLASSIFICATION_DIMENSIONS.business_category),
        usage_purpose: pick(CLASSIFICATION_DIMENSIONS.usage_purpose),
        task_type: pick(CLASSIFICATION_DIMENSIONS.task_type),
        improvement_type: pick(CLASSIFICATION_DIMENSIONS.improvement_type),
        automation_potential: pick(CLASSIFICATION_DIMENSIONS.automation_potential),
        rag_candidate: Math.random() < 0.3,
        sensitivity_level: pick(CLASSIFICATION_DIMENSIONS.sensitivity_level),
        confidence: 0.6 + Math.random() * 0.4,
      },
    });
  }
  for (const s of seedSessions) store.sessions.add(s);
}
