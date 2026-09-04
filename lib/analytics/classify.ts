// 分類実行。移植元: ai-usalysis-demo の src/services/classify.ts + jobs/classify-request.ts。
// 本家は別モデル(classifier role)＋Vercel AI SDK の generateObject を使うが、このハンズオン版は
// チャットと同じ llama.cpp サーバー・同じモデルに素の fetch で問い合わせる（新規依存なし）。

import {
  CLASSIFICATION_JSON_SCHEMA,
  buildClassificationSystemPrompt,
  buildClassificationUserPrompt,
  validateClassification,
} from "./classification-schema";
import type { ClassificationResult } from "./store";

const MAX_ATTEMPTS = 3;

export async function classify(
  llamaUrl: string,
  model: string,
  promptMasked: string,
  responseMasked?: string,
): Promise<ClassificationResult> {
  const systemPrompt = buildClassificationSystemPrompt();
  const userPrompt = buildClassificationUserPrompt(promptMasked, responseMasked);
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt =
      attempt === 1
        ? userPrompt
        : `${userPrompt}\n\n(前回の出力は不正でした。必ず選択肢の中からのみ選び直し、JSONのみを出力してください。エラー: ${lastError})`;

    try {
      const content = await requestClassificationJson(llamaUrl, model, systemPrompt, prompt);
      const parsed = parseJsonLoose(content);
      if (parsed === null) {
        lastError = "JSONとして解析できませんでした";
        continue;
      }
      const result = validateClassification(parsed);
      if (typeof result === "string") {
        lastError = result;
        continue;
      }
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`分類に${MAX_ATTEMPTS}回失敗しました: ${lastError}`);
}

async function requestClassificationJson(
  llamaUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]

  let res: Response
  try {
    res = await fetch(`${llamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        response_format: { type: 'json_schema', json_schema: CLASSIFICATION_JSON_SCHEMA },
      }),
    })
  } catch {
    throw new Error('AIサーバーに接続できませんでした')
  }

  // json_schema 未対応のサーバー向けフォールバック: response_format なしで再試行し、
  // プロンプト内の「JSONのみ出力」指示に頼る。
  if (!res.ok) {
    res = await fetch(`${llamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    })
    if (!res.ok) {
      throw new Error(`分類リクエストが失敗しました (status ${res.status})`)
    }
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('分類応答が空でした')
  return content
}

// コードフェンス付き応答("```json ... ```")にも対応する緩いJSONパース。
function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}
