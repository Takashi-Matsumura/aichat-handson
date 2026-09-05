// /presenter の「プロンプト配信」タブから、講師が事前に用意するハンズオン用プロンプトの
// 一覧を読み書きする。lib/analytics/db.ts と同様に process.cwd() 基準のファイルへ永続化する。
//
// SQLite(lib/analytics/db.ts)ではなくJSONファイルにしているのは、あちらには
// CREATE TABLE IF NOT EXISTS しか無くマイグレーション機構が無いため。事前に作り込む
// 資産(プロンプト文面)を保存するだけなので、単純なJSONの方が事故が少ない。

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type HandsonPrompt = {
  id: string
  title: string
  body: string
  updatedAt: string
}

type PromptsFile = {
  version: 1
  prompts: HandsonPrompt[]
}

const PROMPTS_PATH =
  process.env.PRESENTER_PROMPTS_PATH ?? path.join(process.cwd(), 'data', 'presenter-prompts.json')

const TITLE_MAX_LENGTH = 200
const BODY_MAX_LENGTH = 20000

async function readPromptsFile(): Promise<PromptsFile> {
  try {
    const raw = await readFile(PROMPTS_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.prompts)) return { version: 1, prompts: [] }
    return { version: 1, prompts: parsed.prompts }
  } catch (err) {
    // ファイル未作成(初回起動)は空リスト扱い。それ以外(JSON壊れ等)は呼び出し元に伝播させる。
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, prompts: [] }
    throw err
  }
}

// 書き込み中のクラッシュでファイルが壊れないよう、一時ファイルに書いてからrenameする。
async function writePromptsFile(data: PromptsFile): Promise<void> {
  await mkdir(path.dirname(PROMPTS_PATH), { recursive: true })
  const tmpPath = `${PROMPTS_PATH}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tmpPath, PROMPTS_PATH)
}

export async function listPrompts(): Promise<HandsonPrompt[]> {
  const { prompts } = await readPromptsFile()
  return prompts
}

export type SavePromptInput = { id?: string; title: string; body: string }

export async function savePrompt(
  input: SavePromptInput
): Promise<{ ok: true; prompt: HandsonPrompt } | { ok: false; error: string }> {
  const title = input.title.trim()
  const body = input.body
  if (!title) return { ok: false, error: 'タイトルを入力してください' }
  if (title.length > TITLE_MAX_LENGTH) return { ok: false, error: `タイトルは${TITLE_MAX_LENGTH}文字以内にしてください` }
  if (body.length > BODY_MAX_LENGTH) return { ok: false, error: `本文は${BODY_MAX_LENGTH}文字以内にしてください` }

  const data = await readPromptsFile()
  const updatedAt = new Date().toISOString()

  if (input.id) {
    const idx = data.prompts.findIndex(p => p.id === input.id)
    if (idx === -1) return { ok: false, error: 'プロンプトが見つかりません' }
    const prompt: HandsonPrompt = { id: input.id, title, body, updatedAt }
    data.prompts[idx] = prompt
    await writePromptsFile(data)
    return { ok: true, prompt }
  }

  const prompt: HandsonPrompt = { id: crypto.randomUUID(), title, body, updatedAt }
  data.prompts.push(prompt)
  await writePromptsFile(data)
  return { ok: true, prompt }
}

export async function deletePrompt(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = await readPromptsFile()
  const next = data.prompts.filter(p => p.id !== id)
  if (next.length === data.prompts.length) return { ok: false, error: 'プロンプトが見つかりません' }
  await writePromptsFile({ ...data, prompts: next })
  return { ok: true }
}

// 講師画面での並び替え。ids は新しい表示順で全件のIDを含む必要がある。
export async function reorderPrompts(ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = await readPromptsFile()
  if (ids.length !== data.prompts.length || new Set(ids).size !== ids.length) {
    return { ok: false, error: '並び替え対象が現在の一覧と一致しません' }
  }
  const byId = new Map(data.prompts.map(p => [p.id, p]))
  const reordered: HandsonPrompt[] = []
  for (const id of ids) {
    const prompt = byId.get(id)
    if (!prompt) return { ok: false, error: '並び替え対象が現在の一覧と一致しません' }
    reordered.push(prompt)
  }
  await writePromptsFile({ ...data, prompts: reordered })
  return { ok: true }
}

export async function getPrompt(id: string): Promise<HandsonPrompt | null> {
  const { prompts } = await readPromptsFile()
  return prompts.find(p => p.id === id) ?? null
}
