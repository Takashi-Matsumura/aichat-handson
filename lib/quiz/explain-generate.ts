// 確認テストの追加説明(「もう少し簡単に説明」「例題」)の生成。
//
// 問題の内容は受講者のブラウザから送られてくるが、根拠にするテキストはサーバー側で読んだものだけを使う。
// テキスト全文ではなく該当する章の本文だけを渡すので、軽いモデルでも短時間で返る。
// 出力は短い文章なので、JSONにはせず、届いた差分をそのまま onDelta に渡す。

import { HANDSON_PAGES } from '@/lib/handson/pages'
import { LLAMA_MODEL } from '@/lib/llama/config'
import { readChatContentStream } from '@/lib/llm/stream'
import { buildExplainSystemPrompt, buildExplainUserPrompt, extractChapterSection, type ExplainRequest } from './explain'
import { QUIZ_LLAMA_URL, readHandsonMarkdown } from './generate'
import { extractChapters } from './schema'

// 説明は100〜250字程度。暴走時にスロットを占有し続けない上限でもある。
const MAX_TOKENS = 600
// 問題生成ほどの多様性は要らないので、内容がぶれにくい低めの温度にする。
const TEMPERATURE = 0.5

export type ExplainSource = { pageTitle: string; section: string }

// リクエストの pageId・chapter が実在するテキスト・章を指していれば、根拠にする章の本文を返す。
// 指していなければ null(不正なリクエスト)。
export async function loadExplainSource(req: ExplainRequest): Promise<ExplainSource | null> {
  const page = HANDSON_PAGES.find((p) => p.id === req.pageId)
  if (!page) return null
  const markdown = await readHandsonMarkdown(page.file)
  if (!extractChapters(markdown).includes(req.chapter)) return null
  return { pageTitle: page.title, section: extractChapterSection(markdown, req.chapter) }
}

// LLMにストリーミングで追加説明を頼み、本文の差分が届くたびに onDelta に渡す。
export async function streamExplanation(
  req: ExplainRequest,
  source: ExplainSource,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${QUIZ_LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLAMA_MODEL,
        messages: [
          { role: 'system', content: buildExplainSystemPrompt() },
          { role: 'user', content: buildExplainUserPrompt(req, source.pageTitle, source.section) },
        ],
        stream: true,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error('AIサーバーに接続できませんでした')
  }
  if (!res.ok || !res.body) throw new Error(`追加説明のリクエストが失敗しました (status ${res.status})`)

  let length = 0
  await readChatContentStream(res, (content) => {
    length += content.length
    onDelta(content)
  })
  if (length === 0) throw new Error('追加説明が空でした')
}
