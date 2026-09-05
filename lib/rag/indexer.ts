// RAGインデックスの構築・再構築。
//
// 講師が研修当日に knowledge/ 配下へファイルを置く運用のため、サーバー再起動なしで
// 反映できる必要がある。方式は「遅延構築 + mtime署名による自動再構築 + 明示的な強制再構築」の
// 3点セット:
//   - 起動時ビルドはしない(起動時に埋め込みサーバが未起動だと空のまま固定されてしまうため)
//   - 各チャットリクエストの度に ensureIndex() を呼び、署名が変わっていれば自動で再構築する
//     (署名一致なら stat するだけで即返るので、通常時のコストはごく小さい)
//   - fs.watch は使わない(Dockerのバインドマウント越しにイベントが飛ばない環境があるため)
//   - /presenter の「今すぐ再構築」ボタン用に rebuildIndex() を用意する

import { RAG_CONFIG } from './config'
import { embedTexts, isEmbedServerOnline } from './embed'
import { chunkMarkdown, chunkPlainText } from './chunk'
import { computeSignature, readSourceFile, scanKnowledgeFiles, type SourceFile } from './loader'
import { getIndex, setIndex, ragStore, type Chunk, type RagIndex } from './store'

export async function ensureIndex(): Promise<RagIndex> {
  const files = await scanKnowledgeFiles()
  const signature = computeSignature(files)
  const current = getIndex()
  if (current.signature === signature) return current
  if (ragStore.building) return ragStore.building

  const buildPromise = buildIndex(files, signature).finally(() => {
    ragStore.building = null
  })
  ragStore.building = buildPromise
  return buildPromise
}

// 署名を無視して必ず作り直す(/presenter の再構築ボタン用)。
export async function rebuildIndex(): Promise<RagIndex> {
  const files = await scanKnowledgeFiles()
  const signature = computeSignature(files)
  const buildPromise = buildIndex(files, signature).finally(() => {
    ragStore.building = null
  })
  ragStore.building = buildPromise
  return buildPromise
}

export async function getIndexStatus(): Promise<{
  fileCount: number
  chunkCount: number
  builtAt: Date | null
  dims: number | null
  error: string | null
  online: boolean
  sampleTitles: string[]
}> {
  const index = await ensureIndex()
  const online = await isEmbedServerOnline()
  return {
    fileCount: index.fileCount,
    chunkCount: index.chunks.length,
    builtAt: index.builtAt,
    dims: index.dims,
    error: index.error,
    online,
    sampleTitles: index.chunks.slice(0, 5).map(c => c.title),
  }
}

async function buildIndex(files: SourceFile[], signature: string): Promise<RagIndex> {
  const current = getIndex()
  try {
    const rawChunks: { file: string; title: string; text: string }[] = []
    for (const file of files) {
      const content = await readSourceFile(file)
      const isMarkdown = file.relPath.toLowerCase().endsWith('.md') || file.relPath.toLowerCase().endsWith('.markdown')
      const pieces = isMarkdown ? chunkMarkdown(content, file.relPath) : chunkPlainText(content, file.relPath)
      for (const piece of pieces) {
        rawChunks.push({ file: file.relPath, title: piece.title, text: piece.text })
      }
    }

    if (rawChunks.length === 0) {
      const empty: RagIndex = { chunks: [], fileCount: files.length, signature, builtAt: new Date(), dims: null, error: null }
      setIndex(empty)
      return empty
    }

    const inputs = rawChunks.map(c => `${RAG_CONFIG.docPrefix}${c.title}\n${c.text}`)
    const vectors = await embedTexts(inputs)

    const chunks: Chunk[] = rawChunks.map((c, i) => ({
      id: `${c.file}#${i}`,
      file: c.file,
      title: c.title,
      text: c.text,
      vector: vectors[i],
    }))

    const index: RagIndex = {
      chunks,
      fileCount: files.length,
      signature,
      builtAt: new Date(),
      dims: chunks[0]?.vector.length ?? null,
      error: null,
    }
    setIndex(index)
    return index
  } catch (err) {
    // 失敗しても既存インデックスは保持したまま、エラーだけ記録する(デグレさせない)。
    const message = err instanceof Error ? err.message : String(err)
    const kept: RagIndex = { ...current, error: message }
    setIndex(kept)
    return kept
  }
}
