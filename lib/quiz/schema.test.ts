import { describe, expect, it } from 'vitest'
import {
  QUESTION_STYLES,
  allocateCounts,
  extractChapters,
  pickSpecs,
  shuffleChoices,
  stripChoiceReferences,
  validateQuizItem,
} from './schema'

// 再現可能な擬似乱数(テストで乱択結果を固定するため)。
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31
    return s / 2 ** 31
  }
}

const CHAPTERS = ['第1章：A', '第2章：B']

const q = (question: string, overrides: Record<string, unknown> = {}) => ({
  question,
  correct: '正解の文',
  wrongChoices: ['誤り1', '誤り2', '誤り3'],
  explanation: '第1章に書かれている。',
  chapter: '第1章：A',
  ...overrides,
})

describe('validateQuizItem', () => {
  it('正しい出力を受け入れ、正解を先頭にした選択肢を作る', () => {
    expect(validateQuizItem(q('問題1'), CHAPTERS)).toEqual({
      question: '問題1',
      choices: ['正解の文', '誤り1', '誤り2', '誤り3'],
      answerIndex: 0,
      explanation: '第1章に書かれている。',
      chapter: '第1章：A',
    })
  })

  it('選択肢先頭の記号を取り除く', () => {
    const result = validateQuizItem(q('問題', { correct: 'A. あ', wrongChoices: ['B．い', '3）う', 'Ｄ: え'] }), CHAPTERS)
    expect(typeof result !== 'string' && result.choices).toEqual(['あ', 'い', 'う', 'え'])
  })

  it('誤りの選択肢が多すぎる場合は先頭の3つを使う', () => {
    const result = validateQuizItem(q('問題', { wrongChoices: ['い', 'う', 'え', 'お'] }), CHAPTERS)
    expect(typeof result !== 'string' && result.choices).toEqual(['正解の文', 'い', 'う', 'え'])
  })

  it('解説から選択肢番号への言及を取り除く', () => {
    const result = validateQuizItem(q('問題', { explanation: '正解は1番です。第1章に書かれている。' }), CHAPTERS)
    expect(typeof result !== 'string' && result.explanation).toBe('第1章に書かれている。')
  })

  it.each([
    ['第2章', '第2章：B'],
    ['第２章：トークン', '第2章：B'],
  ])('章番号だけの指定 %s を見出し %s に直す', (chapter, expected) => {
    const result = validateQuizItem(q('問題', { chapter }), CHAPTERS)
    expect(typeof result !== 'string' && result.chapter).toBe(expected)
  })

  it.each([
    ['オブジェクトでない', null],
    ['問題文が空', q('  ')],
    ['誤りの選択肢が2つ', q('問題', { wrongChoices: ['い', 'う'] })],
    ['正解と誤りが重複', q('問題', { correct: 'い', wrongChoices: ['い', 'う', 'え'] })],
    ['記号除去後に選択肢が重複', q('問題', { correct: 'A. い', wrongChoices: ['い', 'う', 'え'] })],
    ['選択肢に文字列以外', q('問題', { wrongChoices: ['い', 'う', 1] })],
    ['正解が文字列でない', q('問題', { correct: 0 })],
    ['解説が空', q('問題', { explanation: '' })],
    ['解説が番号への言及だけ', q('問題', { explanation: '正解は3番です。' })],
    ['章が見出しにない', q('問題', { chapter: '第9章' })],
    ['章が無い', q('問題', { chapter: undefined })],
    ['問題文が長すぎる', q('あ'.repeat(301))],
  ])('%s場合はエラー文字列を返す', (_, value) => {
    expect(typeof validateQuizItem(value, CHAPTERS)).toBe('string')
  })
})

describe('stripChoiceReferences', () => {
  it.each([
    ['正解は1番です。理由は第2章。', '理由は第2章。'],
    ['第2章に記載。A（3番）', '第2章に記載。'],
    ['選択肢Bは誤り。正しくは第1章。', '正しくは第1章。'],
    ['正解はCです。第1章参照。', '第1章参照。'],
  ])('%s → %s', (input, expected) => {
    expect(stripChoiceReferences(input)).toBe(expected)
  })

  it('AIやRAGなどの英字を含む普通の文は残す', () => {
    const text = 'AI（人工知能）は第1章で説明されている。正解はAIに頼りすぎないこと。'
    expect(stripChoiceReferences(text)).toBe(text)
  })
})

describe('shuffleChoices', () => {
  it('並べ替えても正解の選択肢が変わらない', () => {
    const rand = seeded(42)
    const original = { question: '問', choices: ['正解', '誤1', '誤2', '誤3'], answerIndex: 0, explanation: '解説', chapter: '第1章' }
    for (let i = 0; i < 50; i++) {
      const shuffled = shuffleChoices(original, rand)
      expect(shuffled.choices[shuffled.answerIndex]).toBe('正解')
      expect([...shuffled.choices].sort()).toEqual([...original.choices].sort())
    }
  })

  it('正解の位置が偏らない', () => {
    const rand = seeded(7)
    const original = { question: '問', choices: ['正解', '誤1', '誤2', '誤3'], answerIndex: 0, explanation: '解説', chapter: '第1章' }
    const positions = new Set(Array.from({ length: 50 }, () => shuffleChoices(original, rand).answerIndex))
    expect(positions.size).toBe(4)
  })
})

describe('allocateCounts', () => {
  it('合計が出題数になり、差は最大1問', () => {
    const rand = seeded(1)
    for (let i = 0; i < 20; i++) {
      const counts = allocateCounts(3, 10, rand)
      expect(counts.reduce((a, b) => a + b, 0)).toBe(10)
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    }
  })

  it('割り切れる場合は均等', () => {
    expect(allocateCounts(2, 10)).toEqual([5, 5])
  })
})

describe('extractChapters', () => {
  it('はじめに・まとめを除いた章見出しを返す', () => {
    const md = '# タイトル\n## はじめに\n本文\n## 第1章：A\n### 小見出し\n## 第2章：B\n## まとめ\n'
    expect(extractChapters(md)).toEqual(['第1章：A', '第2章：B'])
  })

  it('章が無ければテキスト全体を1章とみなす', () => {
    expect(extractChapters('# タイトル\n本文')).toEqual(['テキスト全体'])
  })
})

describe('pickSpecs', () => {
  it('章数以下の問題数なら章が重複しない', () => {
    const specs = pickSpecs(['第1章', '第2章', '第3章', '第4章'], 4, seeded(3))
    expect(new Set(specs.map((s) => s.chapter)).size).toBe(4)
    for (const s of specs) expect(QUESTION_STYLES).toContain(s.style)
  })

  it('章数より多い問題数でも指定数を返す', () => {
    expect(pickSpecs(['第1章', '第2章'], 5, seeded(3))).toHaveLength(5)
  })
})
