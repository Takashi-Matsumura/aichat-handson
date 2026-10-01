// 確認テストの問題生成。
//
// ハンズオンテキスト(public/handson/*.md)をサーバー側で読み、テキストごとに1回ずつ LLM に
// 問題作成を頼む(並列)。「どの章から・どのスタイルで」をサーバー側で毎回乱択して指示し、
// 選択肢の並びもシャッフルするので、受けるたびに違う問題になる。
// LLM呼び出しの形(json_schema → 失敗時は response_format なしで再試行 → 検証 → 最大3回やり直し)は
// lib/analytics/classify.ts と同じ。

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { HANDSON_PAGES } from '@/lib/handson/pages'
import { LLAMA_MODEL, LLAMA_URLS } from '@/lib/llama/config'
import { parseJsonLoose } from '@/lib/llm/json'
import {
  QUIZ_TOTAL_QUESTIONS,
  allocateCounts,
  buildQuizJsonSchema,
  buildQuizSystemPrompt,
  buildQuizUserPrompt,
  extractChapters,
  pickSpecs,
  shuffle,
  shuffleChoices,
  validateQuizBatch,
  type QuestionSpec,
  type Quiz,
  type QuizItem,
  type QuizQuestion,
} from './schema'

const MAX_ATTEMPTS = 3
// 4問ぶんの問題文・選択肢・解説(日本語)が収まる程度。暴走時にスロットを占有し続けない上限でもある。
const MAX_TOKENS = Number(process.env.LLAMA_QUIZ_MAX_TOKENS ?? 2500)
// 問題の多様性を出すため、チャットより高めの温度にする。
const TEMPERATURE = 0.9
// 大人数で一斉に使うことを想定し、既定ではハンズオンパネル表示中と同じモデル2(軽いモデル)で生成する。
// 少人数で問題の質を優先したい場合は QUIZ_MODEL_INDEX=1 でモデル1に切り替えられる。
const LLAMA_URL = LLAMA_URLS[process.env.QUIZ_MODEL_INDEX === '1' ? 1 : 2]

export async function generateQuiz(signal?: AbortSignal): Promise<Quiz> {
  const counts = allocateCounts(HANDSON_PAGES.length, QUIZ_TOTAL_QUESTIONS)
  // 1テキストでも失敗したらテスト全体が作れないので、残りの生成も打ち切ってスロットを空ける。
  const failFast = new AbortController()
  const batchSignal = signal ? AbortSignal.any([signal, failFast.signal]) : failFast.signal
  try {
    const batches = await Promise.all(
      HANDSON_PAGES.map(async (page, i): Promise<QuizItem[]> => {
        const markdown = await readHandsonMarkdown(page.file)
        const chapters = extractChapters(markdown)
        const specs = pickSpecs(chapters, counts[i])
        const questions = await generateBatch(page.title, markdown, chapters, specs, batchSignal)
        return questions.map((q) => ({ ...shuffleChoices(q), pageId: page.id, pageTitle: page.title }))
      }),
    )
    return { questions: shuffle(batches.flat()) }
  } catch (err) {
    failFast.abort()
    throw err
  }
}

// page.file は "/handson/handson1.md" のような public 配下のパス(定数)。
async function readHandsonMarkdown(file: string): Promise<string> {
  return readFile(path.join(process.cwd(), 'public', file), 'utf8')
}

// 1テキスト分の問題を作る。正しく作れた問題は残し、足りない問数だけを作り直させる。
async function generateBatch(
  pageTitle: string,
  markdown: string,
  chapters: string[],
  specs: QuestionSpec[],
  signal?: AbortSignal,
): Promise<QuizQuestion[]> {
  const systemPrompt = buildQuizSystemPrompt()
  const collected: QuizQuestion[] = []
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    signal?.throwIfAborted()
    const remaining = specs.slice(collected.length)
    const userPrompt = buildQuizUserPrompt(pageTitle, markdown, remaining)
    const prompt =
      attempt === 1
        ? userPrompt
        : `${userPrompt}\n\n(前回の出力には不備がありました。ルールと出力形式を守り、JSONのみを出力してください。不備: ${lastError})`

    try {
      const content = await requestQuizJson(systemPrompt, prompt, buildQuizJsonSchema(remaining.length, chapters), signal)
      const parsed = parseJsonLoose(content)
      const result = parsed === null ? 'JSONとして解析できませんでした' : validateQuizBatch(parsed, chapters, collected.map((q) => q.question))
      if (typeof result === 'string') {
        lastError = result
      } else {
        collected.push(...result.valid)
        lastError = result.errors.join(' / ') || `問題数が足りません(${remaining.length}問必要)`
      }
      if (collected.length >= specs.length) return collected.slice(0, specs.length)
    } catch (err) {
      if (signal?.aborted) throw err
      lastError = err instanceof Error ? err.message : String(err)
    }
    console.warn(`[quiz] 「${pageTitle}」${attempt}回目: ${collected.length}/${specs.length}問 作成済み (${lastError})`)
  }

  throw new Error(`「${pageTitle}」の問題生成に${MAX_ATTEMPTS}回失敗しました: ${lastError}`)
}

// json_schema(文法による出力制約)に対応していないと分かった llama-server のURL。
// 毎回失敗するリクエストを送らないよう、プロセス内で覚えておく。
const schemaUnsupported = new Set<string>()

async function requestQuizJson(
  systemPrompt: string,
  userPrompt: string,
  schema: ReturnType<typeof buildQuizJsonSchema>,
  signal?: AbortSignal,
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
  const common = {
    model: LLAMA_MODEL,
    messages,
    stream: false,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    seed: Math.floor(Math.random() * 2 ** 31),
  }
  const post = async (body: object) => {
    try {
      return await fetch(`${LLAMA_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      if (signal?.aborted) throw err
      throw new Error('AIサーバーに接続できませんでした')
    }
  }

  let res: Response | null = null
  if (!schemaUnsupported.has(LLAMA_URL)) {
    res = await post({ ...common, response_format: { type: 'json_schema', json_schema: schema } })
    // json_schema 未対応のサーバー(文法サンプラーを初期化できない等)は 400 を返す。
    // 以降は response_format なしで送り、プロンプト内の「JSONのみ出力」指示と自前の検証に頼る。
    if (res.status === 400) {
      schemaUnsupported.add(LLAMA_URL)
      console.warn(`[quiz] ${LLAMA_URL} は json_schema に対応していないため、出力制約なしで生成します`)
      res = null
    }
  }
  res ??= await post(common)
  if (!res.ok) throw new Error(`問題生成リクエストが失敗しました (status ${res.status})`)

  const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  const choice = data.choices?.[0]
  // 上限トークン数で途中切れしたJSONは必ず不正になるので、再試行時にLLMへ理由を伝えられるようにする。
  if (choice?.finish_reason === 'length') throw new Error('出力が長すぎて途中で切れました。問題文・選択肢・解説をもっと短くしてください')
  const content = choice?.message?.content
  if (!content) throw new Error('問題生成の応答が空でした')
  return content
}
