// 知識ソースフォルダ(RAG_CONFIG.knowledgeDir)の走査。
//
// 講師が研修当日にファイルを置く運用のため、フォルダが存在しない・空である状態を
// エラーにせず「知識ソースなし」として扱う。RAG関連の関数は例外を投げない方針
// (embed.ts, search.ts, indexer.ts も同様)。

import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { RAG_CONFIG } from './config'

export type SourceFile = { relPath: string; absPath: string; mtimeMs: number; size: number }

const TARGET_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
// この名前のファイルは「置き方の説明」用であり、インデックス対象に含めない。
const IGNORE_FILENAMES = new Set(['README.md'])

export async function scanKnowledgeFiles(): Promise<SourceFile[]> {
  const root = path.resolve(RAG_CONFIG.knowledgeDir)
  const files: SourceFile[] = []
  try {
    await walk(root, root, files)
  } catch {
    // フォルダが存在しない、権限が無い等。知識ソース無しとして扱う。
    return []
  }
  files.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return files
}

async function walk(root: string, dir: string, out: SourceFile[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const absPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(root, absPath, out)
      continue
    }
    if (!entry.isFile()) continue
    if (IGNORE_FILENAMES.has(entry.name)) continue
    if (!TARGET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
    const info = await stat(absPath)
    out.push({
      relPath: path.relative(root, absPath),
      absPath,
      mtimeMs: info.mtimeMs,
      size: info.size,
    })
  }
}

// ファイル一覧から「変更検知用の署名」を作る。パス・更新時刻・サイズが1つでも変われば
// 別の文字列になる。ファイル内容そのもののハッシュより軽量で、講師運用の規模では十分。
export function computeSignature(files: SourceFile[]): string {
  return files
    .map(f => `${f.relPath}:${f.mtimeMs}:${f.size}`)
    .sort()
    .join('|')
}

export async function readSourceFile(f: SourceFile): Promise<string> {
  return readFile(f.absPath, 'utf-8')
}

// /presenter からの新規作成・上書き保存(lib/rag/sources.ts)向けに、relPathを検証して
// 絶対パスに変換する。knowledgeDirの外を指すパス(パストラバーサル)、対象外拡張子、
// README.mdはすべて拒否してnullを返す。
export function resolveManagedPath(relPath: string): string | null {
  const root = path.resolve(RAG_CONFIG.knowledgeDir)
  const normalizedRel = relPath.replace(/^[/\\]+/, '')
  if (!normalizedRel) return null
  const absPath = path.resolve(root, normalizedRel)
  if (absPath !== root && !absPath.startsWith(root + path.sep)) return null
  const base = path.basename(absPath)
  if (IGNORE_FILENAMES.has(base)) return null
  if (!TARGET_EXTENSIONS.has(path.extname(base).toLowerCase())) return null
  return absPath
}
