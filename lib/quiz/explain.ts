// 確認テストの追加説明(「もう少し簡単に説明」「例題」)の型・入力検証・プロンプト。
// サーバーは出題した問題を保存していないので、受講者のブラウザが問題の内容を送り直してくる。
// その内容は信用せず、ここで形と長さを検証する(テキストと章の照合は explain-generate.ts)。

import { CHOICE_COUNT, MAX_CHOICE_CHARS, MAX_EXPLANATION_CHARS, MAX_QUESTION_CHARS } from './schema'

// 「もう少し簡単に説明」は押すたびに1段階ずつやさしくなる。
export const SIMPLER_LEVELS = 3

export type ExplainKind = 'simpler' | 'example'

export type ExplainRequest = {
  kind: ExplainKind
  level: number // 1〜SIMPLER_LEVELS(kind が example のときは 1 固定)
  pageId: number
  chapter: string
  question: string
  choices: string[]
  answerIndex: number
  selected: number // 受講者が選んだ選択肢
  explanation: string
}

// /api/quiz/explain のレスポンス(NDJSON: 1行に1イベント)。
// 説明文の差分を delta で送り、最後に done を送る。失敗した場合は error を送って終わる。
export type ExplainStreamEvent = { type: 'delta'; text: string } | { type: 'done' } | { type: 'error'; message: string }

// 章見出しの長さの上限(実際の見出しとの照合は別に行うので、極端に長い入力を弾くだけ)。
const MAX_CHAPTER_CHARS = 100

function isText(value: unknown, maxChars: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxChars
}

function isChoiceIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < CHOICE_COUNT
}

// リクエスト本文を検証する。形や長さが不正なら null。
export function parseExplainRequest(body: unknown): ExplainRequest | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>

  if (b.kind !== 'simpler' && b.kind !== 'example') return null
  let level = 1
  if (b.kind === 'simpler') {
    if (!Number.isInteger(b.level) || (b.level as number) < 1 || (b.level as number) > SIMPLER_LEVELS) return null
    level = b.level as number
  }
  if (!Number.isInteger(b.pageId)) return null
  if (!isText(b.chapter, MAX_CHAPTER_CHARS)) return null
  if (!isText(b.question, MAX_QUESTION_CHARS)) return null
  if (!Array.isArray(b.choices) || b.choices.length !== CHOICE_COUNT) return null
  if (!b.choices.every((c) => isText(c, MAX_CHOICE_CHARS))) return null
  if (!isChoiceIndex(b.answerIndex) || !isChoiceIndex(b.selected)) return null
  if (!isText(b.explanation, MAX_EXPLANATION_CHARS)) return null

  return {
    kind: b.kind,
    level,
    pageId: b.pageId as number,
    chapter: b.chapter,
    question: b.question,
    choices: b.choices as string[],
    answerIndex: b.answerIndex,
    selected: b.selected,
    explanation: b.explanation,
  }
}

// Markdown から、指定した章("## 見出し")の本文だけを取り出す。
// 章が見つからない場合(章見出しの無いテキストを1章とみなしている場合)はテキスト全体を返す。
export function extractChapterSection(markdown: string, chapter: string): string {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.startsWith('## ') && line.slice(3).trim() === chapter)
  if (start < 0) return markdown.trim()
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return (end < 0 ? rest : rest.slice(0, end))
    .filter((line) => line.trim() !== '---')
    .join('\n')
    .trim()
}

// 段階ごとの説明のしかた。小さいモデルは長い指示を守りにくいので、1段階につき方針は1つに絞る。
const SIMPLER_INSTRUCTIONS = [
  '元の解説を、専門用語やカタカナ語を使わずに、ふだんの言葉で説明し直してください。3文以内、120字以内で書きます。',
  '学校・料理・買い物など、日常の身近なものにたとえて説明してください。たとえ話を2文、それがAIの話とどう対応するのかを1文で書きます。全体で150字以内です。',
  '中学生にも分かるように、いちばんやさしく説明してください。2文だけで書きます。1文目は結論、2文目は理由です。むずかしい言葉は使わず、全体で80字以内にします。',
]

const EXAMPLE_INSTRUCTION = `この問題と同じ考え方を使う例題を1つ作ってください。職場や日常の身近な場面で、確認テストの問題とは別の場面にします。
元の解説の説明し直しは書かず、次の形だけを出力してください。必ず「【例題】」から書き始めます。

【例題】
(場面と問いかけを2〜3文で)

【答えと考え方】
(答えと、その理由を2〜3文で)`

export function buildExplainSystemPrompt(): string {
  return `あなたは社会人向けAI研修の講師です。確認テストに答えた受講者が、解説を読んでもよく分からなかったときに、追加の説明をします。

## ルール
- 「テキストの該当箇所」に書かれている内容だけを根拠にする。書かれていないことを付け足さない
- 受講者は専門家ではないので、平易な日本語で、です・ます調で書く。受講者を責める言い方をしない
- 選択肢は画面でランダムに並んでいるので、「A」「1番」など選択肢の記号・番号に触れない
- 見出し・箇条書き・太字の記号(#、-、* など)を使わず、ふつうの文章で書く
- あいさつや前置き(「はい」「承知しました」など)を書かず、説明そのものから始める
- 最後の「依頼」に書かれた形と長さを守る`
}

// section は、サーバーが読んだテキストの該当章の本文(extractChapterSection の結果)。
// 説明のしかた(依頼)は、小さいモデルでも守りやすいよう、プロンプトの最後に置く。
export function buildExplainUserPrompt(req: ExplainRequest, pageTitle: string, section: string): string {
  const instruction = req.kind === 'example' ? EXAMPLE_INSTRUCTION : SIMPLER_INSTRUCTIONS[req.level - 1]
  // 不正解のときは、選んだ回答がなぜ違うのかが分かると理解しやすい。
  // 例題と、2文だけで言い切る最後の段階では触れない。その場合は誤答そのものも渡さない
  // (渡すと、小さいモデルは正解ではなく誤答のほうを説明し始めることがある)。
  const mentionWrong = req.selected !== req.answerIndex && req.kind === 'simpler' && req.level < SIMPLER_LEVELS
  const wrongAnswer = mentionWrong ? `\n\n## 受講者が選んだ回答(不正解)\n${req.choices[req.selected]}` : ''
  const note = mentionWrong
    ? '\nそのあとに、受講者が選んだ回答がなぜ正しくないのかを、「あなたが選んだ回答は、」で始まる1文で添えてください。'
    : ''
  return `## テキストの該当箇所(「${pageTitle}」${req.chapter})
${section}

## 確認テストの問題
${req.question}

## 正解
${req.choices[req.answerIndex]}${wrongAnswer}

## 元の解説
${req.explanation}

## 依頼
${instruction}${note}`
}

// 画面ではプレーンテキストとして表示するので、LLMが指示に反して付けた太字・見出しの記号を取り除く。
export function cleanExplanation(text: string): string {
  return text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '')
}
