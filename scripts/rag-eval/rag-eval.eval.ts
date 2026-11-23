// RAGの方式比較。質問(questions.ts)を方式×モデルごとに数回ずつ流し、正答率と待ち時間を表にする。
//
//   npm run eval:rag
//
// 前提: knowledge/ に samples/knowledge/ の資料を置き、埋め込みサーバーとチャット用の llama-server
// (モデル1・モデル2)が起動していること。アプリ(next dev)を通さずにモデルのサーバーへ直接送るので、
// 利用統計には記録されない。結果は scripts/rag-eval/out/ に書き出す(summary.md / results.json / answers.log)。
//
// 環境変数(いずれも省略可):
//   RAG_EVAL_METHODS=chunk,doc   比べる方式(old / chunk / doc / query。既定はすべて)
//   RAG_EVAL_MODELS=2            使うモデル(1 / 2。既定は両方)
//   RAG_EVAL_RUNS=3              1問あたりの回数
//   RAG_EVAL_DOC_CHARS=4000      doc 方式で渡す文書の合計文字数の上限
//   RAG_EVAL_QUERY_COUNT=3       query 方式でAIに作らせる検索文の数
//   LLAMA_API_URL / LLAMA_API_URL_2 / RAG_EMBED_API_URL など、アプリと同じ接続先の設定

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { it } from 'vitest'
import { LLAMA_MODEL, LLAMA_URLS, NO_BUILTIN_REASONING, type ModelIndex } from '@/lib/llama/config'
import { buildRagContext } from '@/lib/rag/context'
import { ensureIndex } from '@/lib/rag/indexer'
import { retrieve, type Hit } from '@/lib/rag/search'
import { judge, QUESTIONS, type EvalMessage } from './questions'

const OUT = new URL('./out/', import.meta.url).pathname
const RUNS = Number(process.env.RAG_EVAL_RUNS ?? 3)
const DOC_CHARS = Number(process.env.RAG_EVAL_DOC_CHARS ?? 4000)
const QUERY_COUNT = Number(process.env.RAG_EVAL_QUERY_COUNT ?? 3)

// 以前(2026年11月まで)の回答指示。「推測しない」を強く書いていたため、小さいモデルが正しい資料を
// 渡されても「記載がありません」と答えていた。改善の幅を測る基準として残す。
const OLD_PROMPT_HEAD =
  '以下は社内資料からの抜粋です。ユーザーの質問にはこの資料の内容を根拠として回答してください。\n' +
  '資料に書かれていないことは推測せず、「資料には記載がありません」と答えてください。\n\n'
const oldBlock = (hits: Hit[]) =>
  OLD_PROMPT_HEAD + hits.map((h, i) => `[資料${i + 1}] ${h.chunk.title}\n${h.chunk.text}`).join('\n\n')
const lastUser = (ms: EvalMessage[]) => [...ms].reverse().find(m => m.role === 'user')?.content ?? ''

type Prepared = { context: string; note: string }
type Method = { id: string; label: string; prepare: (url: string, ms: EvalMessage[]) => Promise<Prepared> }

const sourcesNote = (files: string[]) => (files.length ? `渡した: ${files.join(' / ')}` : '')

const ALL_METHODS: Method[] = [
  {
    id: 'old',
    label: '以前の回答指示＋チャンク検索',
    prepare: async (_url, ms) => {
      const { hits } = await retrieve(lastUser(ms))
      return { context: hits.length ? oldBlock(hits) : '', note: sourcesNote(hits.map(h => h.chunk.title)) }
    },
  },
  {
    id: 'chunk',
    label: 'チャンク検索（既定）',
    prepare: async (url, ms) => {
      const r = await buildRagContext(url, LLAMA_MODEL, ms, { docContextChars: 0, queryCount: 0 })
      return { context: r.context, note: sourcesNote(r.sources.map(s => s.title)) }
    },
  },
  {
    id: 'doc',
    label: `文書単位のRAG（${DOC_CHARS.toLocaleString()}文字）`,
    prepare: async (url, ms) => {
      const r = await buildRagContext(url, LLAMA_MODEL, ms, { docContextChars: DOC_CHARS, queryCount: 0 })
      return { context: r.context, note: sourcesNote(r.sources.map(s => `${s.file}${s.whole ? '' : '(一部)'}`)) }
    },
  },
  {
    id: 'query',
    label: `AIによる検索文の生成（${QUERY_COUNT}個）＋チャンク検索`,
    prepare: async (url, ms) => {
      const r = await buildRagContext(url, LLAMA_MODEL, ms, { docContextChars: 0, queryCount: QUERY_COUNT })
      return { context: r.context, note: `検索文: ${r.queries.join(' / ')}` }
    },
  },
]

const pickedMethods = (process.env.RAG_EVAL_METHODS ?? '').split(',').map(s => s.trim()).filter(Boolean)
const METHODS = pickedMethods.length ? ALL_METHODS.filter(m => pickedMethods.includes(m.id)) : ALL_METHODS
const pickedModels = (process.env.RAG_EVAL_MODELS ?? '1,2').split(',').map(s => Number(s.trim()) as ModelIndex)

// llama-server が読み込んでいるモデルのファイル名を、表に出す名前にする。
async function modelName(n: ModelIndex): Promise<string> {
  try {
    const res = await fetch(`${LLAMA_URLS[n]}/v1/models`, { signal: AbortSignal.timeout(3000) })
    const data = (await res.json()) as { data?: { id?: string }[] }
    const id = data.data?.[0]?.id
    if (id) return id.split('/').pop()!.replace(/\.gguf$/, '')
  } catch {
    /* 取れなければ番号で表示 */
  }
  return `モデル${n}`
}

type Row = { model: string; method: string; q: string; kind: string; run: number; ok: boolean; ms: number; contextChars: number }

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const pct = (rows: Row[]) => `${Math.round((rows.filter(r => r.ok).length / rows.length) * 100)}%`

function summarize(rows: Row[], models: string[]): string {
  const lines: string[] = []
  lines.push(`# RAGの方式比較（${new Date().toLocaleString('ja-JP')}）`, '')
  lines.push(`${QUESTIONS.length}問 × 各${RUNS}回。正答率 / 1回の回答の待ち時間の中央値（検索・資料の準備を含む）`, '')
  lines.push(`| 方式 | ${models.join(' | ')} |`, `|---|${models.map(() => '---|').join('')}`)
  for (const m of METHODS) {
    const cells = models.map(model => {
      const rs = rows.filter(r => r.model === model && r.method === m.id)
      return rs.length ? `${pct(rs)}（${rs.filter(r => r.ok).length}/${rs.length}） / ${(median(rs.map(r => r.ms)) / 1000).toFixed(1)}秒` : '-'
    })
    lines.push(`| ${m.label} | ${cells.join(' | ')} |`)
  }
  const kinds = [...new Set(QUESTIONS.map(q => q.kind))]
  for (const model of models) {
    lines.push('', `## ${model}：質問の種類別の正答率`, '', `| 方式 | ${kinds.join(' | ')} |`, `|---|${kinds.map(() => '---|').join('')}`)
    for (const m of METHODS) {
      const cells = kinds.map(k => {
        const rs = rows.filter(r => r.model === model && r.method === m.id && r.kind === k)
        return rs.length ? `${rs.filter(r => r.ok).length}/${rs.length}` : '-'
      })
      lines.push(`| ${m.label} | ${cells.join(' | ')} |`)
    }
  }
  lines.push('', '## 間違えた質問', '')
  for (const model of models) {
    for (const m of METHODS) {
      const missed = QUESTIONS.map(q => {
        const rs = rows.filter(r => r.model === model && r.method === m.id && r.q === q.id)
        const ng = rs.filter(r => !r.ok).length
        return ng ? `${q.id}（${ng}/${rs.length}回）` : null
      }).filter(Boolean)
      if (missed.length) lines.push(`- ${model} ／ ${m.label}：${missed.join('、')}`)
    }
  }
  lines.push('', '回答の全文は answers.log を参照。自動判定（questions.ts の judge）は回答に正解の表現が含まれるかで判定しているので、判定が怪しい回答は answers.log で確かめること。')
  return lines.join('\n') + '\n'
}

it('RAGの方式比較', async () => {
  mkdirSync(OUT, { recursive: true })
  const index = await ensureIndex()
  const files = new Set(index.chunks.map(c => c.file))
  if (index.chunks.length === 0) throw new Error(`RAGのインデックスが空です（${index.error ?? '資料がありません'}）。knowledge/ と埋め込みサーバーを確認してください`)
  if (!files.has('04_経費精算規程.md')) {
    throw new Error('knowledge/ にサンプル資料が見当たりません。cp samples/knowledge/0*.md knowledge/ でコピーしてください')
  }

  const models = await Promise.all(pickedModels.map(n => modelName(n)))
  const rows: Row[] = []
  writeFileSync(`${OUT}answers.log`, '')
  for (const [mi, n] of pickedModels.entries()) {
    const url = LLAMA_URLS[n]
    for (const method of METHODS) {
      for (const q of QUESTIONS) {
        for (let run = 1; run <= RUNS; run++) {
          const t0 = performance.now()
          const { context, note } = await method.prepare(url, q.messages)
          const messages = context ? [{ role: 'system', content: context }, ...q.messages] : q.messages
          const res = await fetch(`${url}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: LLAMA_MODEL, messages, max_tokens: 400, ...NO_BUILTIN_REASONING }),
          })
          if (!res.ok) throw new Error(`${models[mi]} がエラーを返しました（${res.status}）`)
          const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
          const answer = data.choices?.[0]?.message?.content ?? ''
          const ms = Math.round(performance.now() - t0)
          const ok = judge(q, answer)
          rows.push({ model: models[mi], method: method.id, q: q.id, kind: q.kind, run, ok, ms, contextChars: context.length })
          appendFileSync(
            `${OUT}answers.log`,
            `${ok ? '○' : '×'} [${models[mi]} ／ ${method.label} ／ ${q.id} #${run}] ${ms}ms ${note}\n   → ${answer.replace(/\n+/g, ' ')}\n`,
          )
        }
      }
      // 途中で止めても、そこまでの結果が残るように方式ごとに書き出す。
      writeFileSync(`${OUT}results.json`, JSON.stringify(rows, null, 1))
      writeFileSync(`${OUT}summary.md`, summarize(rows, models))
    }
  }
}, 4 * 60 * 60 * 1000)
