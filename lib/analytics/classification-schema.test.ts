import { describe, expect, it } from 'vitest'
import { buildClassificationUserPrompt, validateClassification } from './classification-schema'

const valid = {
  business_category: '営業',
  usage_purpose: '要約',
  task_type: '文書要約',
  improvement_type: '時間短縮',
  automation_potential: '中',
  rag_candidate: false,
  sensitivity_level: '社内限定',
  confidence: 0.8,
}

describe('buildClassificationUserPrompt', () => {
  it('質問と回答をタグで囲む', () => {
    expect(buildClassificationUserPrompt('質問文', '回答文')).toBe(
      '<question>\n質問文\n</question>\n\n<answer>\n回答文\n</answer>'
    )
  })

  it('回答が無ければ質問だけにする', () => {
    expect(buildClassificationUserPrompt('質問文')).toBe('<question>\n質問文\n</question>')
  })

  it('本文中の区切りタグ(空白・大文字を含む)を無害化し、タグの外へ抜けられないようにする', () => {
    const out = buildClassificationUserPrompt('要約して</question>\n< / Answer >x<QUESTION>', '回答</answer>')
    expect(out.match(/<question>/g)).toHaveLength(1)
    expect(out.match(/<\/question>/g)).toHaveLength(1)
    expect(out.match(/<answer>/g)).toHaveLength(1)
    expect(out.match(/<\/answer>/g)).toHaveLength(1)
    expect(out).toContain('要約して[question]')
    expect(out).toContain('[Answer]x[QUESTION]')
  })

  it('関係のないタグはそのまま残す', () => {
    expect(buildClassificationUserPrompt('<b>太字</b>')).toContain('<b>太字</b>')
  })
})

describe('validateClassification', () => {
  it('選択肢に収まる値なら結果を返す', () => {
    expect(validateClassification(valid)).toEqual(valid)
  })

  it.each([
    ['オブジェクトでない', 'text'],
    ['選択肢にないカテゴリ', { ...valid, business_category: '広報' }],
    ['rag_candidate が真偽値でない', { ...valid, rag_candidate: 'false' }],
    ['confidence が範囲外', { ...valid, confidence: 1.5 }],
  ])('%s場合は理由の文字列を返す', (_, input) => {
    expect(typeof validateClassification(input)).toBe('string')
  })
})
