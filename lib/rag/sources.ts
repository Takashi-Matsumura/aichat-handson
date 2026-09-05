// /presenter の「RAGソース」タブから、知識ソースファイルの内容を閲覧・編集・保存するための操作。
// indexer.ts が扱う検索用インデックスとは別に、ファイルそのものの読み書きを担当する。

import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readSourceFile, resolveManagedPath, scanKnowledgeFiles } from './loader'

export type SourceFileContent = {
  relPath: string
  content: string
  mtimeMs: number
  size: number
}

export async function listSourceContents(): Promise<SourceFileContent[]> {
  const files = await scanKnowledgeFiles()
  return Promise.all(
    files.map(async f => ({
      relPath: f.relPath,
      content: await readSourceFile(f),
      mtimeMs: f.mtimeMs,
      size: f.size,
    }))
  )
}

export async function saveSourceContent(
  relPath: string,
  content: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const absPath = resolveManagedPath(relPath)
  if (!absPath) {
    return { ok: false, error: '無効なファイル名です（.md または .txt のみ、README.mdは使用不可）' }
  }
  await mkdir(path.dirname(absPath), { recursive: true })
  await writeFile(absPath, content, 'utf-8')
  return { ok: true }
}

export async function deleteSourceContent(
  relPath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const absPath = resolveManagedPath(relPath)
  if (!absPath) {
    return { ok: false, error: '無効なファイル名です（.md または .txt のみ、README.mdは使用不可）' }
  }
  try {
    await unlink(absPath)
    return { ok: true }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, error: 'ファイルが見つかりません（既に削除されている可能性があります）' }
    }
    throw err
  }
}
