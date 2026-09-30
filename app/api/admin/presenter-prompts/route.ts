// /presenter の「プロンプト配信」タブから、事前に用意するハンズオン用プロンプトの
// 一覧取得・作成・上書き保存・並び替え・削除を行う。
// 講師のみ利用できる(lib/presenter/auth.ts の requirePresenter)。

import { deletePrompt, listPrompts, reorderPrompts, savePrompt } from '@/lib/presenter/prompts'
import { requirePresenter } from '@/lib/presenter/auth'
import { invalidJsonResponse, readJsonObject } from '@/lib/http/json'

export async function GET(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const prompts = await listPrompts()
  return Response.json({ prompts })
}

export async function POST(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const payload = await readJsonObject(request)
  if (!payload) return invalidJsonResponse()
  const { id, title, body } = payload
  if (typeof title !== 'string' || typeof body !== 'string') {
    return Response.json({ error: 'titleとbodyが必要です' }, { status: 400 })
  }
  const result = await savePrompt({ id: typeof id === 'string' ? id : undefined, title, body })
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }
  const prompts = await listPrompts()
  return Response.json({ ok: true, prompt: result.prompt, prompts })
}

export async function PUT(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const body = await readJsonObject(request)
  if (!body) return invalidJsonResponse()
  const { ids } = body
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) {
    return Response.json({ error: 'idsが必要です' }, { status: 400 })
  }
  const result = await reorderPrompts(ids)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }
  const prompts = await listPrompts()
  return Response.json({ ok: true, prompts })
}

export async function DELETE(request: Request) {
  const denied = await requirePresenter(request)
  if (denied) return denied
  const body = await readJsonObject(request)
  if (!body) return invalidJsonResponse()
  const { id } = body
  if (typeof id !== 'string') {
    return Response.json({ error: 'idが必要です' }, { status: 400 })
  }
  const result = await deletePrompt(id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 })
  }
  const prompts = await listPrompts()
  return Response.json({ ok: true, prompts })
}
