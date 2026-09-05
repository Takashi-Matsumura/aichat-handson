// AI利用ログの書き込み口。SQLite(lib/analytics/db.ts)への唯一の書き込み経路。
//
// promptMasked/responseMasked・セッションIDは保存しない。会場全体の集計に必要な
// 数値・分類結果だけを永続化する（個人統計はブラウザ側で完結させる設計のため）。

import { getDb } from "./db";

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
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  latencyMs?: number;
  status: "success" | "error";
  errorMessage?: string;
  createdAt: Date;
};

export function addRequest(record: AiRequestRecord): void {
  getDb()
    .prepare(
      `INSERT INTO ai_requests
        (id, provider, model, input_tokens, output_tokens, estimated_cost, latency_ms, status, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.id,
      record.provider,
      record.model,
      record.inputTokens ?? null,
      record.outputTokens ?? null,
      record.estimatedCost ?? null,
      record.latencyMs ?? null,
      record.status,
      record.errorMessage ?? null,
      record.createdAt.toISOString(),
    );
}

/** 分類が非同期(after())で完了した後、対応レコードへ分類結果(の一部)を書き戻す。 */
export function attachClassification(requestId: string, classification: ClassificationResult): void {
  getDb()
    .prepare(
      `UPDATE ai_requests
       SET business_category = ?, usage_purpose = ?, task_type = ?, improvement_type = ?, automation_potential = ?, sensitivity_level = ?
       WHERE id = ?`,
    )
    .run(
      classification.business_category,
      classification.usage_purpose,
      classification.task_type,
      classification.improvement_type,
      classification.automation_potential,
      classification.sensitivity_level,
      requestId,
    );
}
