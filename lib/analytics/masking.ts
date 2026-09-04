// 保存前マスキング。ai-usalysis-demo の src/lib/masking.ts を無改造で移植したもの。
// チャット本文・応答本文をインメモリストアに保存する前に、個人情報・機密情報らしき文字列を
// [MASKED:xxx] に置換する。

type MaskRule = {
  name: string;
  pattern: RegExp;
};

const RULES: MaskRule[] = [
  { name: "EMAIL", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  {
    name: "CREDIT_CARD",
    pattern: /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,4}\b/g,
  },
  { name: "PHONE", pattern: /\b0\d{1,4}-\d{1,4}-\d{3,4}\b|\b0\d{9,10}\b/g },
  {
    name: "API_KEY",
    pattern:
      /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|bearer)\s*[:=]?\s*['"]?[A-Za-z0-9_\-.]{16,}['"]?/gi,
  },
  { name: "PASSWORD", pattern: /\b(?:password|pwd|passwd)\s*[:=]\s*\S+/gi },
  {
    name: "INTERNAL_URL",
    pattern:
      /\bhttps?:\/\/(?:(?:[a-zA-Z0-9-]+\.)*(?:internal|local|intra|corp)(?:\.[a-zA-Z]{2,})?|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/[^\s]*)?/gi,
  },
];

export type MaskMatch = { rule: string; count: number };

export type MaskResult = {
  masked: string;
  matches: MaskMatch[];
};

export function maskText(text: string): MaskResult {
  let masked = text;
  const matches: MaskMatch[] = [];

  for (const rule of RULES) {
    let count = 0;
    masked = masked.replace(rule.pattern, () => {
      count += 1;
      return `[MASKED:${rule.name}]`;
    });
    if (count > 0) matches.push({ rule: rule.name, count });
  }

  return { masked, matches };
}
