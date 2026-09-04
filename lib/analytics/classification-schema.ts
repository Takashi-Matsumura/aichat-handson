// 分類の JSON Schema・プロンプト・値検証。
// 移植元: ai-usalysis-demo の src/schemas/classification.ts + src/prompts/classification.ts。
// 本家は zod + Vercel AI SDK の generateObject を使うが、ted-aichat は素の fetch で
// llama.cpp の OpenAI 互換 response_format(json_schema) に問い合わせ、返却JSONを手で検証する。
// (教材として「LLMにJSON Schemaで構造化出力を頼み、自前で検証する」流れが見える方を選んでいる)

import { CLASSIFICATION_DIMENSIONS } from "./categories";
import type { ClassificationResult } from "./store";

export const CLASSIFICATION_VERSION = "v1";

// llama.cpp (OpenAI互換) の response_format: { type: "json_schema", json_schema: {...} } に渡すschema。
export const CLASSIFICATION_JSON_SCHEMA = {
  name: "classification",
  schema: {
    type: "object",
    properties: {
      business_category: { type: "string", enum: [...CLASSIFICATION_DIMENSIONS.business_category] },
      usage_purpose: { type: "string", enum: [...CLASSIFICATION_DIMENSIONS.usage_purpose] },
      task_type: { type: "string", enum: [...CLASSIFICATION_DIMENSIONS.task_type] },
      improvement_type: { type: "string", enum: [...CLASSIFICATION_DIMENSIONS.improvement_type] },
      automation_potential: { type: "string", enum: [...CLASSIFICATION_DIMENSIONS.automation_potential] },
      rag_candidate: { type: "boolean" },
      sensitivity_level: { type: "string", enum: [...CLASSIFICATION_DIMENSIONS.sensitivity_level] },
      confidence: { type: "number" },
    },
    required: [
      "business_category",
      "usage_purpose",
      "task_type",
      "improvement_type",
      "automation_potential",
      "rag_candidate",
      "sensitivity_level",
      "confidence",
    ],
    additionalProperties: false,
  },
} as const;

export function buildClassificationSystemPrompt(): string {
  const d = CLASSIFICATION_DIMENSIONS;
  const exampleJson = JSON.stringify(
    {
      business_category: d.business_category[0],
      usage_purpose: d.usage_purpose[0],
      task_type: d.task_type[0],
      improvement_type: d.improvement_type[0],
      automation_potential: d.automation_potential[0],
      rag_candidate: false,
      sensitivity_level: d.sensitivity_level[0],
      confidence: 0.8,
    },
    null,
    2,
  );

  return `あなたは社内向け生成AI利用ログの分類アシスタントです。
与えられた「質問」（と存在すれば「回答」）を読み、指定された各項目に最も当てはまる値を選んでください。

## 出力形式（最重要）
- 出力は下記キーを持つ**JSONオブジェクト1つのみ**とすること。
- 説明文・前置き・Markdownのコードフェンス(\`\`\`)は一切付けないこと。1文字目は "{"、最後の文字は "}" にすること。
- 例:
${exampleJson}

## 分類ルール
- 各項目は必ず選択肢の中から1つだけ選ぶこと。選択肢にない値を作らないこと。
- automation_potential は、この種の質問への対応を定型化・自動化できる度合いを表す。
- rag_candidate は、社内ドキュメント（RAG）を整備すれば同種の質問に高品質に回答できそうな場合に true (真偽値)。
- sensitivity_level は、質問・回答に含まれる可能性のある情報の機密度を保守的に（疑わしきは高めに）判定する。
- confidence は 0〜1 の数値で、分類結果に対する自分の確信度。

## 選択肢
業務カテゴリ(business_category): ${d.business_category.join(", ")}
利用目的(usage_purpose): ${d.usage_purpose.join(", ")}
タスク種別(task_type): ${d.task_type.join(", ")}
改善視点(improvement_type): ${d.improvement_type.join(", ")}
機密度(sensitivity_level): ${d.sensitivity_level.join(", ")}
自動化可能性(automation_potential): ${d.automation_potential.join(", ")}`;
}

export function buildClassificationUserPrompt(promptMasked: string, responseMasked?: string): string {
  const parts = [`質問:\n${promptMasked}`];
  if (responseMasked) {
    parts.push(`回答:\n${responseMasked}`);
  }
  return parts.join("\n\n");
}

/** LLM出力(任意の値)を検証し、選択肢に収まっていれば ClassificationResult を返す。ダメなら理由文字列を返す。 */
export function validateClassification(value: unknown): ClassificationResult | string {
  if (typeof value !== "object" || value === null) return "JSONオブジェクトではありません";
  const v = value as Record<string, unknown>;
  const d = CLASSIFICATION_DIMENSIONS;

  const checkEnum = (key: keyof typeof d, val: unknown): string | null =>
    typeof val === "string" && (d[key] as readonly string[]).includes(val)
      ? null
      : `${key} が選択肢にありません: ${JSON.stringify(val)}`;

  for (const key of [
    "business_category",
    "usage_purpose",
    "task_type",
    "improvement_type",
    "automation_potential",
    "sensitivity_level",
  ] as const) {
    const err = checkEnum(key, v[key]);
    if (err) return err;
  }
  if (typeof v.rag_candidate !== "boolean") return `rag_candidate が真偽値ではありません: ${JSON.stringify(v.rag_candidate)}`;
  if (typeof v.confidence !== "number" || v.confidence < 0 || v.confidence > 1) {
    return `confidence が0〜1の数値ではありません: ${JSON.stringify(v.confidence)}`;
  }

  return {
    business_category: v.business_category as string,
    usage_purpose: v.usage_purpose as string,
    task_type: v.task_type as string,
    improvement_type: v.improvement_type as string,
    automation_potential: v.automation_potential as string,
    rag_candidate: v.rag_candidate,
    sensitivity_level: v.sensitivity_level as string,
    confidence: v.confidence,
  };
}
