// 集計ロジック。移植元: ai-usalysis-demo の src/server/analytics.ts。
// 本家は PostgreSQL への生SQL($queryRaw)で集計するが、このハンズオン版はDBを持たないため
// インメモリストア(lib/analytics/store.ts)の配列を filter/reduce で集計する。
// 認可(requireRole)・部署別集計は行わない（ログインを省いているため）。
// activeUserCount は「ユーザー」の代わりに擬似セッションID(sessionId)のユニーク数を数える。

import type { DateRange } from "./analytics-query";
import { getAllRequests, type AiRequestRecord } from "./store";

export const CLASSIFICATION_DIMENSION_COLUMNS = [
  "business_category",
  "usage_purpose",
  "task_type",
  "improvement_type",
  "automation_potential",
  "sensitivity_level",
] as const;

export type ClassificationDimension = (typeof CLASSIFICATION_DIMENSION_COLUMNS)[number];

export type Summary = {
  requestCount: number;
  activeUserCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  averageLatencyMs: number | null;
  errorRate: number;
  dailyCounts: { date: string; count: number }[];
  monthlyCounts: { month: string; count: number }[];
};

function filterByRange(from: Date, to: Date, sessionId?: string): AiRequestRecord[] {
  return getAllRequests().filter(
    (r) => r.createdAt >= from && r.createdAt < to && (sessionId == null || r.sessionId === sessionId),
  );
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export async function getSummary({ from, to }: DateRange, sessionId?: string): Promise<Summary> {
  const rows = filterByRange(from, to, sessionId);
  const requestCount = rows.length;
  const activeUserCount = new Set(rows.map((r) => r.sessionId)).size;
  const inputTokens = rows.reduce((a, r) => a + (r.inputTokens ?? 0), 0);
  const outputTokens = rows.reduce((a, r) => a + (r.outputTokens ?? 0), 0);
  const estimatedCost = rows.reduce((a, r) => a + (r.estimatedCost ?? 0), 0);
  const averageLatencyMs = average(rows.map((r) => r.latencyMs).filter((v): v is number => v != null));
  const errorCount = rows.filter((r) => r.status !== "success").length;

  const dailyMap = new Map<string, number>();
  const monthlyMap = new Map<string, number>();
  for (const r of rows) {
    const date = r.createdAt.toISOString().slice(0, 10);
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1);
    monthlyMap.set(date.slice(0, 7), (monthlyMap.get(date.slice(0, 7)) ?? 0) + 1);
  }
  const dailyCounts = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
  const monthlyCounts = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return {
    requestCount,
    activeUserCount,
    inputTokens,
    outputTokens,
    estimatedCost,
    averageLatencyMs,
    errorRate: requestCount > 0 ? errorCount / requestCount : 0,
    dailyCounts,
    monthlyCounts,
  };
}

export async function getCategoryBreakdown(
  { from, to }: DateRange,
  dimensions: ClassificationDimension[] = [...CLASSIFICATION_DIMENSION_COLUMNS],
): Promise<Record<string, { value: string; count: number }[]>> {
  const rows = filterByRange(from, to).filter((r) => r.classification);

  const result: Record<string, { value: string; count: number }[]> = {};
  for (const dimension of dimensions) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const value = String(r.classification![dimension]);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    result[dimension] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }
  return result;
}

export type ModelStat = {
  provider: string;
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  averageLatencyMs: number | null;
  errorCount: number;
};

export async function getModelStats({ from, to }: DateRange, sessionId?: string): Promise<ModelStat[]> {
  const rows = filterByRange(from, to, sessionId);

  type Acc = {
    provider: string;
    model: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
    latencies: number[];
    errorCount: number;
  };
  const map = new Map<string, Acc>();
  for (const r of rows) {
    const key = `${r.provider}/${r.model}`;
    const entry =
      map.get(key) ??
      { provider: r.provider, model: r.model, requestCount: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0, latencies: [], errorCount: 0 };
    entry.requestCount += 1;
    entry.inputTokens += r.inputTokens ?? 0;
    entry.outputTokens += r.outputTokens ?? 0;
    entry.estimatedCost += r.estimatedCost ?? 0;
    if (r.latencyMs != null) entry.latencies.push(r.latencyMs);
    if (r.status !== "success") entry.errorCount += 1;
    map.set(key, entry);
  }

  return [...map.values()]
    .map((e) => ({
      provider: e.provider,
      model: e.model,
      requestCount: e.requestCount,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      estimatedCost: e.estimatedCost,
      averageLatencyMs: average(e.latencies),
      errorCount: e.errorCount,
    }))
    .sort((a, b) => b.requestCount - a.requestCount);
}

// 本家の CandidateItem から departmentName を除去したもの（部署別分析は行わないため）。
export type CandidateItem = {
  requestId: string;
  createdAt: string;
  businessCategory: string;
  usagePurpose: string;
  taskType: string;
  confidence: number;
  promptExcerpt: string;
};

function toCandidateItem(r: AiRequestRecord): CandidateItem {
  const c = r.classification!;
  return {
    requestId: r.id,
    createdAt: r.createdAt.toISOString(),
    businessCategory: c.business_category,
    usagePurpose: c.usage_purpose,
    taskType: c.task_type,
    confidence: c.confidence,
    promptExcerpt: r.promptMasked.slice(0, 200),
  };
}

function paginate(rows: AiRequestRecord[], page: number, pageSize: number): { items: CandidateItem[]; total: number } {
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const total = sorted.length;
  const start = (page - 1) * pageSize;
  return { items: sorted.slice(start, start + pageSize).map(toCandidateItem), total };
}

export async function getRagCandidates(
  { from, to }: DateRange,
  page: number,
  pageSize: number,
): Promise<{ items: CandidateItem[]; total: number }> {
  const rows = filterByRange(from, to).filter((r) => r.classification?.rag_candidate === true);
  return paginate(rows, page, pageSize);
}

export async function getAutomationCandidates(
  { from, to }: DateRange,
  page: number,
  pageSize: number,
): Promise<{ items: CandidateItem[]; total: number }> {
  // 「候補」は自動化可能性が「高」と判定されたものに限定する。
  const rows = filterByRange(from, to).filter((r) => r.classification?.automation_potential === "高");
  return paginate(rows, page, pageSize);
}
