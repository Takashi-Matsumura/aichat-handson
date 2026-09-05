// 集計ロジック。SQLite(lib/analytics/db.ts)に対するSQL集計。
// 認可(requireRole)・部署別集計は行わない（ログインを省いているため）。
// activeUserCount は永続化していない(lib/analytics/active-sessions.ts の)非永続カウンタから取る。

import type { DateRange } from "./analytics-query";
import { getDb } from "./db";
import { getActiveSessionCount } from "./active-sessions";
import { CLASSIFICATION_DIMENSION_COLUMNS, type ClassificationDimension, type Summary, type ModelStat } from "./types";

export { CLASSIFICATION_DIMENSION_COLUMNS };
export type { ClassificationDimension, Summary, ModelStat };

function toIso(d: Date): string {
  return d.toISOString();
}

export async function getSummary({ from, to }: DateRange): Promise<Summary> {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) as requestCount,
         COALESCE(SUM(input_tokens), 0) as inputTokens,
         COALESCE(SUM(output_tokens), 0) as outputTokens,
         COALESCE(SUM(estimated_cost), 0) as estimatedCost,
         AVG(latency_ms) as averageLatencyMs,
         SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as errorCount
       FROM ai_requests
       WHERE created_at >= ? AND created_at < ?`,
    )
    .get(toIso(from), toIso(to)) as {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    averageLatencyMs: number | null;
    errorCount: number;
  };

  const dailyCounts = db
    .prepare(
      `SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
       FROM ai_requests
       WHERE created_at >= ? AND created_at < ?
       GROUP BY date ORDER BY date`,
    )
    .all(toIso(from), toIso(to)) as { date: string; count: number }[];

  const monthlyCounts = db
    .prepare(
      `SELECT substr(created_at, 1, 7) as month, COUNT(*) as count
       FROM ai_requests
       WHERE created_at >= ? AND created_at < ?
       GROUP BY month ORDER BY month`,
    )
    .all(toIso(from), toIso(to)) as { month: string; count: number }[];

  return {
    requestCount: totals.requestCount,
    activeUserCount: getActiveSessionCount(from, to),
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    estimatedCost: totals.estimatedCost,
    averageLatencyMs: totals.averageLatencyMs != null ? Math.round(totals.averageLatencyMs) : null,
    errorRate: totals.requestCount > 0 ? totals.errorCount / totals.requestCount : 0,
    dailyCounts,
    monthlyCounts,
  };
}

export async function getCategoryBreakdown(
  { from, to }: DateRange,
  dimensions: ClassificationDimension[] = [...CLASSIFICATION_DIMENSION_COLUMNS],
): Promise<Record<string, { value: string; count: number }[]>> {
  const db = getDb();
  const result: Record<string, { value: string; count: number }[]> = {};
  for (const dimension of dimensions) {
    // dimension はCLASSIFICATION_DIMENSION_COLUMNS由来の固定値のみを許可する
    // (SQLの列名位置へ直接埋め込むため、任意文字列の混入を防ぐ)。
    if (!CLASSIFICATION_DIMENSION_COLUMNS.includes(dimension)) continue;
    const rows = db
      .prepare(
        `SELECT ${dimension} as value, COUNT(*) as count
         FROM ai_requests
         WHERE created_at >= ? AND created_at < ? AND ${dimension} IS NOT NULL
         GROUP BY ${dimension} ORDER BY count DESC`,
      )
      .all(toIso(from), toIso(to)) as { value: string; count: number }[];
    result[dimension] = rows;
  }
  return result;
}

export async function getModelStats({ from, to }: DateRange): Promise<ModelStat[]> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         provider, model,
         COUNT(*) as requestCount,
         COALESCE(SUM(input_tokens), 0) as inputTokens,
         COALESCE(SUM(output_tokens), 0) as outputTokens,
         COALESCE(SUM(estimated_cost), 0) as estimatedCost,
         AVG(latency_ms) as averageLatencyMs,
         SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as errorCount
       FROM ai_requests
       WHERE created_at >= ? AND created_at < ?
       GROUP BY provider, model
       ORDER BY requestCount DESC`,
    )
    .all(toIso(from), toIso(to)) as {
    provider: string;
    model: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    averageLatencyMs: number | null;
    errorCount: number;
  }[];

  return rows.map((r) => ({
    ...r,
    averageLatencyMs: r.averageLatencyMs != null ? Math.round(r.averageLatencyMs) : null,
  }));
}
