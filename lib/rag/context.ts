// RAGでAIに渡す資料(context)と、画面に出す出典(sources)を作る入口。
//
// 既定では、質問と意味が近い上位 topK 件のチャンクを渡す。RAG_DOC_CONTEXT_CHARS を指定すると、
// チャンクの類似度で文書の順位を付け、順位の高い文書から全文を文字数の上限まで渡す(lib/rag/documents.ts)。
// RAG_QUERY_COUNT を指定すると、AIが会話から作った検索文も合わせて検索する(lib/rag/query.ts)。
// どれも例外を投げない(失敗したら資料なしで答えさせ、チャット自体は壊さない)。

import { RAG_CONFIG } from './config'
import { loadDocuments, packDocuments, rankDocuments } from './documents'
import { buildContextBlock, buildDocumentBlock, toDocSourceRefs, toSourceRefs, type SourceRef } from './prompt'
import { generateRagQueries, type RagQueryMessage } from './query'
import { retrieveAll } from './search'

export type RagContext = { context: string; sources: SourceRef[]; queries: string[] }
export type RagOptions = { docContextChars?: number; docMaxCount?: number; queryCount?: number }

function lastUserText(messages: RagQueryMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content
  }
  return ''
}

export async function buildRagContext(
  llamaUrl: string,
  model: string,
  messages: RagQueryMessage[],
  opts: RagOptions = {},
): Promise<RagContext> {
  const docContextChars = opts.docContextChars ?? RAG_CONFIG.docContextChars
  const docMaxCount = opts.docMaxCount ?? RAG_CONFIG.docMaxCount
  const queries = await generateRagQueries(llamaUrl, model, messages, opts.queryCount ?? RAG_CONFIG.queryCount)
  const { hits } = await retrieveAll([lastUserText(messages), ...queries])
  if (hits.length === 0) return { context: '', sources: [], queries }
  if (docContextChars > 0) {
    try {
      const packed = packDocuments(rankDocuments(hits), await loadDocuments(), docContextChars, docMaxCount)
      if (packed.length > 0) return { context: buildDocumentBlock(packed), sources: toDocSourceRefs(packed), queries }
    } catch {
      // 資料フォルダが読めないときは、インデックスに残っているチャンクだけで答える。
    }
  }
  const top = hits.slice(0, RAG_CONFIG.topK)
  return { context: buildContextBlock(top), sources: toSourceRefs(top), queries }
}
