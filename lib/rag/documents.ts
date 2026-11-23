// 文書単位のRAG: チャンクで探して、文書で読ませる。
//
// チャンクだけを渡すと「上位数件に入らなかった部分はAIの目に入らない」ため、同じ文書の離れた
// 場所をまたぐ質問(例: 誕生日休暇は特別休暇の表に載り、申請期限は別の節に書いてある)に弱い。
// そこで、チャンクの類似度を文書ごとにまとめて文書の順位を付け、順位の高い文書から全文を
// 文字数の上限まで渡す。上限に入りきらない文書は、その文書の中で当たったチャンクだけを渡す。

import { readSourceFile, scanKnowledgeFiles } from './loader'
import type { Hit } from './search'

export type SourceDoc = { file: string; title: string; content: string }
export type RankedDoc = { file: string; score: number; hits: Hit[] }
// whole: 全文を渡す / chunks: 入りきらないので当たったチャンクだけを渡す
export type PackedDoc = { file: string; title: string; score: number; kind: 'whole' | 'chunks'; text: string; best: Hit }

// 資料の最初の見出し(無ければファイル名)を、出典に表示する題名にする。
export function docTitle(content: string, file: string): string {
  const heading = content.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m)
  return heading ? heading[1].trim() : file
}

export async function loadDocuments(): Promise<SourceDoc[]> {
  const docs: SourceDoc[] = []
  for (const f of await scanKnowledgeFiles()) {
    const content = (await readSourceFile(f)).trim()
    if (content) docs.push({ file: f.relPath, title: docTitle(content, f.relPath), content })
  }
  return docs
}

// チャンクの検索結果(類似度の高い順)を文書ごとにまとめ、文書の順位を付ける。
// 文書の点数は、その文書で一番近いチャンクの類似度。
export function rankDocuments(hits: Hit[]): RankedDoc[] {
  const byFile = new Map<string, RankedDoc>()
  for (const hit of hits) {
    const doc = byFile.get(hit.chunk.file)
    if (doc) {
      doc.hits.push(hit)
      doc.score = Math.max(doc.score, hit.score)
    } else {
      byFile.set(hit.chunk.file, { file: hit.chunk.file, score: hit.score, hits: [hit] })
    }
  }
  return [...byFile.values()].sort((a, b) => b.score - a.score)
}

// 順位の高い文書から、全文を maxChars まで詰める。全文が入りきらない文書は、当たったチャンクを
// 類似度の高い順に入るだけ入れる。maxDocs を超える文書は入れない(関係の薄い文書で枠を埋めないため)。
export function packDocuments(ranked: RankedDoc[], docs: SourceDoc[], maxChars: number, maxDocs: number): PackedDoc[] {
  const byFile = new Map(docs.map(d => [d.file, d]))
  const packed: PackedDoc[] = []
  let used = 0
  for (const r of ranked) {
    if (packed.length >= maxDocs) break
    const doc = byFile.get(r.file)
    const best = r.hits[0]
    const title = doc?.title ?? best.chunk.title
    if (doc && used + doc.content.length <= maxChars) {
      packed.push({ file: r.file, title, score: r.score, kind: 'whole', text: doc.content, best })
      used += doc.content.length
      continue
    }
    const pieces: string[] = []
    for (const hit of r.hits) {
      const piece = `## ${hit.chunk.title}\n${hit.chunk.text}`
      if (used + piece.length > maxChars) break
      pieces.push(piece)
      used += piece.length
    }
    if (pieces.length > 0) packed.push({ file: r.file, title, score: r.score, kind: 'chunks', text: pieces.join('\n\n'), best })
  }
  return packed
}
