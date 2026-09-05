// /presenter の「プロンプト配信」タブから、事前に用意するハンズオン用プロンプトの
// 一覧取得・作成・上書き保存・並び替え・削除を行う。
// admin/model-lock, admin/rag-sources と同様に認証は行わない（このアプリ全体の方針）。

import { deletePrompt, listPrompts, reorderPrompts, savePrompt } from '@/lib/presenter/prompts'

export async function GET() {
  const prompts = await listPrompts()
  return Response.json({ prompts })
}

export async function POST(request: Request) {
  const { id, title, body } = await request.json()
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
  const { ids } = await request.json()
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
  const { id } = await request.json()
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
