// AI利用ログのインメモリストア。
//
// ai-usalysis-demo は PostgreSQL + Prisma に永続化するが、このハンズオン版はDBを持たない。
// 代わりに Next.js サーバープロセスのメモリ内にため込むだけにする（サーバー再起動で消えてよい）。
// dev の HMR でモジュールが再評価されてもデータが消えないよう、globalThis に固定して保持する。

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
};

const globalForStore = globalThis as unknown as { __aiAnalyticsStore?: Store };

export const store: Store =
  globalForStore.__aiAnalyticsStore ??
  (globalForStore.__aiAnalyticsStore = { requests: [], sessions: new Set() });

export function registerSession(sessionId: string): void {
  store.sessions.add(sessionId);
}

export function addRequest(record: AiRequestRecord): void {
  store.sessions.add(record.sessionId);
  store.requests.push(record);
}

/** 分類が非同期(after())で完了した後、対応レコードへ結果を書き戻す。 */
export function attachClassification(requestId: string, classification: ClassificationResult): void {
  const record = store.requests.find((r) => r.id === requestId);
  if (record) record.classification = classification;
}

export function getAllRequests(): AiRequestRecord[] {
  return store.requests;
}
