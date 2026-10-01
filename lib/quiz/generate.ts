// 確認テストの問題生成。
//
// ハンズオンテキスト(public/handson/*.md)をサーバー側で読み、テキストごとに1回ずつ LLM に
// 問題作成を頼む(並列)。「どの章から・どのスタイルで」をサーバー側で毎回乱択して指示し、
// 選択肢の並びもシャッフルするので、受けるたびに違う問題になる。
// LLMの出力はストリーミングで受け取り、1問分のJSONが閉じた時点で検証して onQuestion に渡す。
// 受講者は1問目ができた時点で解き始められ、残りは解いている間に裏で作られる。
// LLM呼び出しの形(json_schema → 未対応なら response_format なし → 自前で検証 → 足りない分を作り直し)は
// lib/analytics/classify.ts を踏襲している。

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { HANDSON_PAGES } from '@/lib/handson/pages'
import { LLAMA_MODEL, LLAMA_URLS } from '@/lib/llama/config'
import { createArrayItemExtractor } from '@/lib/llm/json'
import {
  QUIZ_TOTAL_QUESTIONS,
  allocateCounts,
  buildQuizJsonSchema,
  buildQuizSystemPrompt,
  buildQuizUserPrompt,
  extractChapters,
  pickSpecs,
  shuffleChoices,
  validateQuizItem,
  type QuestionSpec,
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

export type QuizGenerationResult = { count: number; errors: string[] }

// 予定の出題数(QUIZ_TOTAL_QUESTIONS)を目標に問題を作り、できた順に onQuestion へ渡す。
// あるテキストの生成が最後まで失敗しても、他のテキストの生成は続ける(作れた分で受験できるようにする)。
// 問題はテキストごとの生成が並行して届くので、届いた順(＝テキストが混ざった順)がそのまま出題順になる。
export async function generateQuiz(onQuestion: (item: QuizItem) => void, signal?: AbortSignal): Promise<QuizGenerationResult> {
  const counts = allocateCounts(HANDSON_PAGES.length, QUIZ_TOTAL_QUESTIONS)
  let count = 0
  const errors: string[] = []
  await Promise.all(
    HANDSON_PAGES.map(async (page, i) => {
      try {
        const markdown = await readHandsonMarkdown(page.file)
        const chapters = extractChapters(markdown)
        const specs = pickSpecs(chapters, counts[i])
        await generateBatch(page.title, markdown, chapters, specs, signal, (q) => {
          count++
          onQuestion({ ...shuffleChoices(q), pageId: page.id, pageTitle: page.title })
        })
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }),
  )
  return { count, errors }
}

// page.file は "/handson/handson1.md" のような public 配下のパス(定数)。
async function readHandsonMarkdown(file: string): Promise<string> {
  return readFile(path.join(process.cwd(), 'public', file), 'utf8')
}

// 1テキスト分の問題を作り、検証を通った問題から順に onQuestion へ渡す。
// 足りなければ、足りない問数だけを作り直させる。
async function generateBatch(
  pageTitle: string,
  markdown: string,
  chapters: string[],
  specs: QuestionSpec[],
  signal: AbortSignal | undefined,
  onQuestion: (q: QuizQuestion) => void,
): Promise<void> {
  const systemPrompt = buildQuizSystemPrompt()
  const seen = new Set<string>()
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    signal?.throwIfAborted()
    const remaining = specs.slice(seen.size)
    const userPrompt = buildQuizUserPrompt(pageTitle, markdown, remaining)
    const prompt =
      attempt === 1
        ? userPrompt
        : `${userPrompt}\n\n(前回の出力には不備がありました。ルールと出力形式を守り、JSONのみを出力してください。不備: ${lastError})`
    const errors: string[] = []

    try {
      await streamQuizJson(systemPrompt, prompt, buildQuizJsonSchema(remaining.length, chapters), signal, (raw) => {
        if (seen.size >= specs.length) return
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          errors.push('JSONとして解析できない問題がありました')
          return
        }
        const result = validateQuizItem(parsed, chapters)
        if (typeof result === 'string') return void errors.push(result)
        if (seen.has(result.question)) return void errors.push('他の問題と重複しています')
        seen.add(result.question)
        onQuestion(result)
      })
    } catch (err) {
      if (signal?.aborted) throw err
      errors.push(err instanceof Error ? err.message : String(err))
    }
    if (seen.size >= specs.length) return
    lastError = errors.join(' / ') || `問題数が足りません(${remaining.length}問必要)`
    console.warn(`[quiz] 「${pageTitle}」${attempt}回目: ${seen.size}/${specs.length}問 作成済み (${lastError})`)
  }

  throw new Error(`「${pageTitle}」の問題を${specs.length}問中${seen.size}問しか作れませんでした: ${lastError}`)
}

// json_schema(文法による出力制約)に対応していないと分かった llama-server のURL。
// 毎回失敗するリクエストを送らないよう、プロセス内で覚えておく。
const schemaUnsupported = new Set<string>()

// LLMにストリーミングで問題作成を頼み、問題1問分のJSONが閉じるたびにその文字列を onItem に渡す。
async function streamQuizJson(
  systemPrompt: string,
  userPrompt: string,
  schema: ReturnType<typeof buildQuizJsonSchema>,
  signal: AbortSignal | undefined,
  onItem: (raw: string) => void,
): Promise<void> {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
  const common = {
    model: LLAMA_MODEL,
    messages,
    stream: true,
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
      await res.body?.cancel()
      res = null
    }
  }
  res ??= await post(common)
  if (!res.ok || !res.body) throw new Error(`問題生成リクエストが失敗しました (status ${res.status})`)

  // llama.cpp の SSE("data: {...}" 行)から本文の差分を取り出し、要素の取り出し器に流し込む。
  const extract = createArrayItemExtractor()
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let pending = ''
  let finishReason: string | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pending += value
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      let event: { choices?: { delta?: { content?: string }; finish_reason?: string | null }[] }
      try {
        event = JSON.parse(line.slice(6))
      } catch {
        continue
      }
      const choice = event.choices?.[0]
      if (choice?.finish_reason) finishReason = choice.finish_reason
      const content = choice?.delta?.content
      if (content) extract(content).forEach(onItem)
    }
  }
  // 上限トークン数で途中切れした場合、最後の問題は不完全なので、再試行時にLLMへ理由を伝える。
  if (finishReason === 'length') throw new Error('出力が長すぎて途中で切れました。問題文・選択肢・解説をもっと短くしてください')
}
