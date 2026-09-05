// 利用統計の型定義。lib/analytics/analytics.ts (node:sqlite に依存するサーバー専用コード)から
// 分離しているのは、'use client' なコンポーネント(AdminStatsPanel等)が型だけを安全に
// importできるようにするため。analytics.ts に同居させると、node:sqlite がクライアント側
// バンドルに引き込まれようとしてビルドエラーになる。

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
