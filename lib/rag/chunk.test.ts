import { describe, expect, it } from 'vitest'
import { chunkMarkdown, chunkPlainText } from './chunk'
import { RAG_CONFIG } from './config'

describe('chunkMarkdown', () => {
  it('見出しごとに分割し、見出しの階層をパンくずにする', () => {
    const md = [
      '# 就業規則',
      '第1条 この規則は全従業員に適用します。対象範囲は正社員と契約社員です。',
      '## 休暇',
      '年次有給休暇は入社6か月後に10日付与します。申請は2営業日前までです。',
      '# 経費精算',
      '経費は発生月の翌月10日までに精算システムから申請してください。',
    ].join('\n')
    expect(chunkMarkdown(md, 'rules.md').map(c => c.title)).toEqual([
      '就業規則',
      '就業規則 > 休暇',
      '経費精算',
    ])
  })

  it('見出しが無ければファイル名をタイトルにする', () => {
    const text = '見出しの無い資料です。この文章は二十文字以上あるのでチャンクとして残ります。'
    expect(chunkMarkdown(text, 'plain.md')).toEqual([{ title: 'plain.md', text }])
  })

  it('20文字未満の短すぎるチャンクは捨てる', () => {
    expect(chunkMarkdown('# 見出し\n短い', 'a.md')).toEqual([])
  })

  it('長いセクションはチャンクサイズ以下に分割する', () => {
    const long = '# 長文\n' + 'これはテスト用の文です。'.repeat(200)
    const chunks = chunkMarkdown(long, 'long.md')
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.title).toBe('長文')
      expect(c.text.length).toBeLessThanOrEqual(RAG_CONFIG.chunkSize)
    }
  })
})

describe('chunkPlainText', () => {
  it('空の文章はチャンクにしない', () => {
    expect(chunkPlainText('   ', 'empty.txt')).toEqual([])
  })

  it('句点の位置で区切り、隣り合うチャンクを重ねる', () => {
    const text = 'あいうえおかきくけこ。'.repeat(100)
    const chunks = chunkPlainText(text, 'a.txt')
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks.slice(0, -1)) expect(c.text.endsWith('。')).toBe(true)
    // 2つ目のチャンクの先頭は、1つ目の末尾(オーバーラップ分)と重なる
    const overlap = chunks[0].text.slice(-RAG_CONFIG.chunkOverlap).trim()
    expect(chunks[1].text.startsWith(overlap.slice(0, 10))).toBe(true)
  })
})
