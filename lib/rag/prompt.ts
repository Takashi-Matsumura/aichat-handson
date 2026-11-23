// 検索結果(Hit[])を、クライアント表示用の SourceRef と、LLMのsystemに埋め込む
// コンテキスト文字列に変換する。

import type { PackedDoc } from './documents'
import type { Hit } from './search'

export type SourceRef = {
  id: string
  file: string
  title: string
  snippet: string
  score: number
  // 文書単位のRAGで、この文書の全文をAIに渡したとき true(false/未指定はチャンクだけを渡した)。
  whole?: boolean
}

const SNIPPET_LENGTH = 200

export function toSourceRefs(hits: Hit[]): SourceRef[] {
  return hits.map(hit => ({
    id: hit.chunk.id,
    file: hit.chunk.file,
    title: hit.chunk.title,
    snippet: hit.chunk.text.length > SNIPPET_LENGTH ? `${hit.chunk.text.slice(0, SNIPPET_LENGTH)}…` : hit.chunk.text,
    score: Math.round(hit.score * 1000) / 1000,
  }))
}

// 回答のしかたの決まり(検索モード・全文モード共通)。
// 「資料に書かれていないことは推測しない」を強く書くと、特に小さいモデル(gemma-3-4b)が、答えになる部分を
// 渡されていても「記載がありません」と答えてしまう(言い換えた質問・上位の決まりが当てはまる質問で確認)。
// そこで、言い換えや項目の包含関係を例で示し、「記載がありません」は答えにつながる内容が無いときだけに限る。
const ANSWER_RULES =
  '- 質問と資料で言葉が違っても、意味が同じなら答えとして使う(在宅勤務＝リモートワーク、お金の補助＝手当 など)\n' +
  '- 誕生日休暇が特別休暇の表に載っているように、ある項目が別の項目の一部なら、上位の項目の決まりも当てはまる\n' +
  '- 必要なら資料の複数の箇所を組み合わせて答える\n' +
  '- どこにも答えにつながる内容が無いときだけ、推測せずに「資料には記載がありません」と答える\n\n'

export function buildContextBlock(hits: Hit[]): string {
  const sections = hits
    .map((hit, i) => `[資料${i + 1}] ${hit.chunk.title}\n${hit.chunk.text}`)
    .join('\n\n')
  return (
    '以下は、社員の質問に関係しそうな社内資料の抜粋です。抜粋の中から質問の答えになる部分を探して、結論を先に、簡潔に答えてください。\n' +
    ANSWER_RULES +
    sections
  )
}

// 文書単位のRAGの出典。渡した文書ごとに1件で、文書の中で一番近かったチャンクを抜粋に使う。
export function toDocSourceRefs(packed: PackedDoc[]): SourceRef[] {
  return packed.map(doc => {
    const text = doc.best.chunk.text
    return {
      id: doc.file,
      file: doc.file,
      title: doc.kind === 'whole' ? doc.title : `${doc.title}（一部）`,
      snippet: text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text,
      score: Math.round(doc.score * 1000) / 1000,
      whole: doc.kind === 'whole',
    }
  })
}

export function buildDocumentBlock(packed: PackedDoc[]): string {
  const sections = packed
    .map((doc, i) => `[資料${i + 1}: ${doc.file}${doc.kind === 'whole' ? '' : '（関係する部分のみ）'}]\n${doc.text}`)
    .join('\n\n')
  return (
    '以下は、社員の質問に関係しそうな社内資料です(関係が深い順)。資料の中から質問の答えになる部分を探して、結論を先に、簡潔に答えてください。\n' +
    ANSWER_RULES +
    sections
  )
}
