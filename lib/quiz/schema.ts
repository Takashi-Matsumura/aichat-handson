// 確認テストの JSON Schema・プロンプト・値検証、および乱択ヘルパー。
// 分類(lib/analytics/classification-schema.ts)と同じく、llama.cpp の response_format(json_schema)
// で構造化出力を頼み、返ってきたJSONは信用せずに自前で検証する。
// 乱択は引数の rand で差し替えられるようにして、テストで結果を固定できるようにしている。

export type Rand = () => number

// 検証済みの1問分(選択肢シャッフル前)。choices[answerIndex] が正解。
export type QuizQuestion = {
  question: string
  choices: string[]
  answerIndex: number
  explanation: string
  chapter: string
}

// APIが返す1問分。どのテキストから出題したかを付ける。
export type QuizItem = QuizQuestion & {
  pageId: number
  pageTitle: string
}

export type Quiz = { questions: QuizItem[] }

export const QUIZ_TOTAL_QUESTIONS = 10
export const CHOICE_COUNT = 4

// 出題スタイル。毎回ランダムに割り当てて、問題の雰囲気が固定化しないようにする。
// 「誤っているものを選べ」形式は、小さいモデルだと正解の向きを取り違えやすいため採用していない。
export const QUESTION_STYLES = [
  { key: 'scenario', label: '事例判断', instruction: '職場や日常の具体的な場面を設定し、その場面での適切な行動・判断を問う' },
  { key: 'concept', label: '用語理解', instruction: 'テキストに出てくる用語や仕組みについて、正しい説明を選ばせる' },
  { key: 'reason', label: '理由・目的', instruction: 'テキストで勧めている行動や注意点について、「なぜそうするのか」の理由・目的を問う' },
] as const

export type QuestionStyle = (typeof QUESTION_STYLES)[number]

// 問題ごとの出題指定(どの章から・どのスタイルで)。
export type QuestionSpec = { chapter: string; style: QuestionStyle }

// 文字数の上限(暴走した出力を弾くための値)。JSON Schema の maxLength にも使い、
// json_schema が効くサーバーでは生成時点で長さを縛る。
// 望ましい長さはこれより短く、プロンプトの「長さの目安」で伝える(目安を少し超えた程度の
// 問題まで捨てると、出力制約が効かないサーバーでは作り直しが多発するため)。
const MAX_QUESTION_CHARS = 300
const MAX_CHOICE_CHARS = 150
const MAX_EXPLANATION_CHARS = 400

// LLMには正解の位置(番号)を答えさせず、「正解の文」と「誤りの選択肢3つ」を分けて出させる。
// 小さいモデルは正解番号と解説が食い違いがちなので、並び順はサーバー側で組み立てる。
// 章名はテキストの章見出しから選ばせる(画面に「出典」として出すため)。
export function buildQuizJsonSchema(count: number, chapters: string[]) {
  return {
    name: 'quiz',
    schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          minItems: count,
          maxItems: count,
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', maxLength: MAX_QUESTION_CHARS },
              correct: { type: 'string', maxLength: MAX_CHOICE_CHARS },
              wrongChoices: {
                type: 'array',
                items: { type: 'string', maxLength: MAX_CHOICE_CHARS },
                minItems: CHOICE_COUNT - 1,
                maxItems: CHOICE_COUNT - 1,
              },
              explanation: { type: 'string', maxLength: MAX_EXPLANATION_CHARS },
              chapter: { type: 'string', enum: chapters },
            },
            required: ['question', 'correct', 'wrongChoices', 'explanation', 'chapter'],
            additionalProperties: false,
          },
        },
      },
      required: ['questions'],
      additionalProperties: false,
    },
  } as const
}

export function buildQuizSystemPrompt(): string {
  const example = JSON.stringify(
    {
      questions: [
        {
          question: '問題文',
          correct: '正解の選択肢',
          wrongChoices: ['誤りの選択肢', '誤りの選択肢', '誤りの選択肢'],
          explanation: '正解の理由と、テキストのどこに書かれているか',
          chapter: '根拠となる章の見出し(テキストの「## 」見出しのまま)',
        },
      ],
    },
    null,
    2,
  )
  return `あなたは社会人向けAI研修の確認テストを作成する講師です。
与えられた「ハンズオンテキスト」の内容だけを根拠に、4択問題を作成してください。

## ルール
- テキストに書かれていないことは出題しない。正解は必ずテキストの記述から判断できるものにする
- 正解(correct)はちょうど1つ。誤りの選択肢(wrongChoices)3つは、もっともらしいがテキストの内容に照らして明確に誤りであるもの
- 誤りの選択肢に、正解と言えてしまうもの(テキストの内容と矛盾しないもの)を混ぜない。
  たとえば「入力してはいけない情報はどれか」で、個人情報・パスワードなど入力してはいけないものを複数並べない
- 問題文に章名や「〜の内容を理解する問題です」のような前置きを書かず、問いそのものから始める
- 選択肢の長さや書き方をそろえ、長さや言い回しで正解が推測できないようにする
- 「すべて正しい」「どれも誤り」のような選択肢は使わない
- 選択肢の先頭に「A.」「1.」などの記号・番号を付けない
- 選択肢は画面でランダムに並べ替えるので、解説では「A」「1番」など選択肢の記号・番号に触れない。正解の理由を内容で説明し、根拠となる章名を示す
- 受講者は専門家ではないので、平易な日本語で書く
- 長さの目安: 問題文は80字以内、選択肢は1つ40字以内、解説は120字以内
- JSONのみを出力し、前後に説明文を付けない

## 出力形式
${example}`
}

export function buildQuizUserPrompt(pageTitle: string, markdown: string, specs: QuestionSpec[]): string {
  const lines = specs.map(
    (s, i) => `- 問${i + 1}: 「${s.chapter}」の内容から、${s.style.label}の問題（${s.style.instruction}）`,
  )
  return `## ハンズオンテキスト「${pageTitle}」
${markdown}

## 作成する問題
次の${specs.length}問を、この順番で作成してください。
${lines.join('\n')}`
}

// Markdown の "## 見出し" のうち、出題対象にする章の見出しを取り出す。
// 「はじめに」「まとめ」は内容が他章の要約なので除く(章が1つも無ければテキスト全体を1章とみなす)。
export function extractChapters(markdown: string): string[] {
  const chapters = markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim())
    .filter((title) => title && title !== 'はじめに' && title !== 'まとめ')
  return chapters.length > 0 ? chapters : ['テキスト全体']
}

// LLMが選択肢の先頭に付けがちな "A. " "1）" などの記号を取り除く。
function stripChoiceLabel(choice: string): string {
  return choice.replace(/^\s*[A-DＡ-Ｄa-d1-4１-４][.．、)）:：]\s*/, '').trim()
}

// 解説から「正解は1番です。」「A（3番）」のように選択肢を記号・番号で指す文を取り除く。
// 選択肢はシャッフルするので、番号での言及は画面上の並びと食い違ってしまう。
const CHOICE_REFERENCE = /[0-9０-９]番|選択肢\s*[A-DＡ-Ｄa-d0-9０-９]|(^|[^A-Za-zＡ-Ｚａ-ｚ])[A-DＡ-Ｄ]\s*[（(]|正解は\s*[A-DＡ-Ｄ](?![A-Za-zＡ-Ｚａ-ｚ])/
export function stripChoiceReferences(explanation: string): string {
  return (explanation.match(/[^。\n]+(。|\n|$)/g) ?? [])
    .filter((sentence) => !CHOICE_REFERENCE.test(sentence))
    .join('')
    .trim()
}

// 「第2章」のように見出しの一部しか書かれていなくても、章番号が一致すれば正式な見出しに直す。
// (json_schema が効かないサーバーでは enum で縛れないため)
function resolveChapter(value: unknown, chapters: string[]): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (chapters.includes(text)) return text
  const num = text.match(/第\s*([0-9０-９]+)\s*章/)?.[1]
  if (!num) return null
  const normalized = num.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
  return chapters.find((c) => c.startsWith(`第${normalized}章`)) ?? null
}

// 1問分を検証・正規化する。問題なければ問題(正解は choices[0])を、不正ならエラー内容(文字列)を返す。
export function validateQuizItem(value: unknown, chapters: string[]): QuizQuestion | string {
  if (typeof value !== 'object' || value === null) return 'オブジェクトではありません'
  const q = value as Record<string, unknown>

  const question = typeof q.question === 'string' ? q.question.trim() : ''
  if (!question) return '問題文が空です'
  if (question.length > MAX_QUESTION_CHARS) return '問題文が長すぎます'

  if (typeof q.correct !== 'string') return 'correct が文字列ではありません'
  if (!Array.isArray(q.wrongChoices) || !q.wrongChoices.every((c) => typeof c === 'string')) {
    return 'wrongChoices が文字列の配列ではありません'
  }
  // 誤りの選択肢を多めに書いてくることがあるので、先頭の3つだけ使う(足りない場合は不正)。
  if (q.wrongChoices.length < CHOICE_COUNT - 1) return `wrongChoices が${CHOICE_COUNT - 1}つありません`
  const choices = [q.correct, ...(q.wrongChoices as string[]).slice(0, CHOICE_COUNT - 1)].map(stripChoiceLabel)
  if (choices.some((c) => !c)) return '空の選択肢があります'
  if (choices.some((c) => c.length > MAX_CHOICE_CHARS)) return '選択肢が長すぎます'
  if (new Set(choices).size !== CHOICE_COUNT) return '選択肢が重複しています'

  const rawExplanation = typeof q.explanation === 'string' ? q.explanation.trim() : ''
  if (!rawExplanation) return '解説が空です'
  if (rawExplanation.length > MAX_EXPLANATION_CHARS) return '解説が長すぎます'
  const explanation = stripChoiceReferences(rawExplanation)
  if (!explanation) return '解説が選択肢の番号・記号にしか触れていません。内容で説明してください'

  const chapter = resolveChapter(q.chapter, chapters)
  if (!chapter) return 'chapter がテキストの章見出しと一致しません'

  return { question, choices, answerIndex: 0, explanation, chapter }
}

export type BatchValidation = { valid: QuizQuestion[]; errors: string[] }

// LLMの出力(複数問)を1問ずつ検証する。正しい問題だけを残し、不正だった問題の理由を errors に集める。
// 呼び出し側は足りない問数だけを作り直させればよく、1問の不備で全問を捨てずに済む。
// 出力全体が使えない(問題の配列が見つからない)場合はエラー内容(文字列)を返す。
// エラー文字列は再試行時にそのままLLMへ渡すので、何を直せばよいかが分かる書き方にする。
export function validateQuizBatch(value: unknown, chapters: string[], existingQuestions: string[] = []): BatchValidation | string {
  const items = Array.isArray(value) ? value : (value as { questions?: unknown } | null)?.questions
  if (!Array.isArray(items)) return 'questions 配列を持つJSONオブジェクトではありません'

  const seen = new Set(existingQuestions)
  const valid: QuizQuestion[] = []
  const errors: string[] = []
  items.forEach((item, i) => {
    const result = validateQuizItem(item, chapters)
    if (typeof result === 'string') {
      errors.push(`問${i + 1}: ${result}`)
    } else if (seen.has(result.question)) {
      errors.push(`問${i + 1}: 他の問題と重複しています`)
    } else {
      seen.add(result.question)
      valid.push(result)
    }
  })
  return { valid, errors }
}

// Fisher–Yates シャッフル(非破壊)。
export function shuffle<T>(items: readonly T[], rand: Rand = Math.random): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// 選択肢の並びをシャッフルし、正解位置を付け替える。
// LLMは正解を先頭に置きがちなので、その偏りをサーバー側で消す。
export function shuffleChoices(q: QuizQuestion, rand: Rand = Math.random): QuizQuestion {
  const order = shuffle(q.choices.map((_, i) => i), rand)
  return { ...q, choices: order.map((i) => q.choices[i]), answerIndex: order.indexOf(q.answerIndex) }
}

// 合計 total 問をテキスト数 n にできるだけ均等に割り振る。端数(+1問)を受け持つテキストはランダム。
export function allocateCounts(n: number, total: number, rand: Rand = Math.random): number[] {
  const base = Math.floor(total / n)
  const extra = new Set(shuffle([...Array(n).keys()], rand).slice(0, total % n))
  return [...Array(n).keys()].map((i) => base + (extra.has(i) ? 1 : 0))
}

// count 問ぶんの出題指定を作る。章はなるべく重複しないように選び、スタイルは問題ごとにランダム。
export function pickSpecs(chapters: string[], count: number, rand: Rand = Math.random): QuestionSpec[] {
  const picked: string[] = []
  while (picked.length < count) picked.push(...shuffle(chapters, rand))
  return picked.slice(0, count).map((chapter) => ({
    chapter,
    style: QUESTION_STYLES[Math.floor(rand() * QUESTION_STYLES.length)],
  }))
}
