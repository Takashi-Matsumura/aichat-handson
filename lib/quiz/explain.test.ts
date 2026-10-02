import { describe, expect, it } from 'vitest'
import {
  buildExplainSystemPrompt,
  buildExplainUserPrompt,
  cleanExplanation,
  extractChapterSection,
  parseExplainRequest,
} from './explain'

const body = (overrides: Record<string, unknown> = {}) => ({
  kind: 'simpler',
  level: 2,
  pageId: 1,
  chapter: '第1章：A',
  question: '問題文',
  choices: ['選択肢1', '選択肢2', '選択肢3', '選択肢4'],
  answerIndex: 0,
  selected: 2,
  explanation: '元の解説。',
  ...overrides,
})

describe('parseExplainRequest', () => {
  it('正しいリクエストを受け入れる', () => {
    expect(parseExplainRequest(body())).toEqual(body())
  })

  it('例題では level を無視して 1 にする', () => {
    expect(parseExplainRequest(body({ kind: 'example', level: 99 }))?.level).toBe(1)
    expect(parseExplainRequest(body({ kind: 'example', level: undefined }))?.level).toBe(1)
  })

  it('余分なプロパティは捨てる', () => {
    expect(parseExplainRequest(body({ extra: 'x' }))).toEqual(body())
  })

  it.each([
    ['オブジェクトでない', null],
    ['kind が不正', body({ kind: 'other' })],
    ['level が範囲外', body({ level: 4 })],
    ['level が 0', body({ level: 0 })],
    ['level が整数でない', body({ level: 1.5 })],
    ['level が文字列', body({ level: '1' })],
    ['pageId が整数でない', body({ pageId: '1' })],
    ['chapter が空', body({ chapter: ' ' })],
    ['chapter が長すぎる', body({ chapter: 'あ'.repeat(101) })],
    ['question が空', body({ question: '' })],
    ['question が長すぎる', body({ question: 'あ'.repeat(301) })],
    ['choices が配列でない', body({ choices: '選択肢' })],
    ['choices が3つ', body({ choices: ['1', '2', '3'] })],
    ['choices が5つ', body({ choices: ['1', '2', '3', '4', '5'] })],
    ['choices に文字列以外', body({ choices: ['1', '2', '3', 4] })],
    ['choices が長すぎる', body({ choices: ['1', '2', '3', 'あ'.repeat(151)] })],
    ['answerIndex が範囲外', body({ answerIndex: 4 })],
    ['selected が負', body({ selected: -1 })],
    ['selected が整数でない', body({ selected: 1.5 })],
    ['explanation が無い', body({ explanation: undefined })],
    ['explanation が長すぎる', body({ explanation: 'あ'.repeat(401) })],
  ])('%s場合は拒否する', (_, value) => {
    expect(parseExplainRequest(value)).toBeNull()
  })
})

describe('extractChapterSection', () => {
  const markdown = `# タイトル

## はじめに

導入の文。

---

## 第1章：A

### 仕組み

Aの本文。

---

## 第2章：B

Bの本文。
`

  it('指定した章の本文だけを取り出す(区切り線は除く)', () => {
    expect(extractChapterSection(markdown, '第1章：A')).toBe('### 仕組み\n\nAの本文。')
  })

  it('最後の章は末尾まで取り出す', () => {
    expect(extractChapterSection(markdown, '第2章：B')).toBe('Bの本文。')
  })

  it('章が見つからなければテキスト全体を返す', () => {
    expect(extractChapterSection('見出しの無い本文。\n', 'テキスト全体')).toBe('見出しの無い本文。')
  })
})

describe('buildExplainSystemPrompt', () => {
  it('選択肢の記号に触れないよう指示する', () => {
    expect(buildExplainSystemPrompt()).toContain('選択肢の記号・番号に触れない')
  })
})

describe('buildExplainUserPrompt', () => {
  const req = (overrides: Record<string, unknown> = {}) => parseExplainRequest(body(overrides))!
  // プロンプトの最後に置く「依頼」(説明のしかた)の部分
  const instruction = (overrides: Record<string, unknown> = {}) =>
    buildExplainUserPrompt(req(overrides), 'テキスト名', '章の本文').split('## 依頼\n')[1]

  it('段階ごとに説明のしかたが変わる', () => {
    const instructions = [1, 2, 3].map((level) => instruction({ level }))
    expect(new Set(instructions).size).toBe(3)
    expect(instructions[1]).toContain('たとえて')
    expect(instructions[2]).toContain('中学生')
  })

  it('例題では例題の形を指示する', () => {
    expect(instruction({ kind: 'example' })).toContain('【例題】')
    expect(instruction({ kind: 'example' })).toContain('【答えと考え方】')
  })

  it('章の本文・問題・正解・元の解説を含める', () => {
    const prompt = buildExplainUserPrompt(req(), 'テキスト名', '章の本文')
    expect(prompt).toContain('「テキスト名」第1章：A')
    expect(prompt).toContain('章の本文')
    expect(prompt).toContain('問題文')
    expect(prompt).toContain('## 正解\n選択肢1')
    expect(prompt).toContain('元の解説。')
  })

  it('不正解のときは選んだ回答を伝え、なぜ正しくないのかに触れさせる', () => {
    const prompt = buildExplainUserPrompt(req(), 'テキスト名', '章の本文')
    expect(prompt).toContain('## 受講者が選んだ回答(不正解)\n選択肢3')
    expect(prompt).toContain('なぜ正しくないのか')
  })

  it.each([
    ['正解のとき', { selected: 0 }],
    ['例題', { kind: 'example' }],
    ['最後の段階', { level: 3 }],
  ])('%sは誤答を渡さず、触れさせない', (_, overrides) => {
    const prompt = buildExplainUserPrompt(req(overrides), 'テキスト名', '章の本文')
    expect(prompt).not.toContain('受講者が選んだ回答')
    expect(prompt).not.toContain('選択肢3')
  })
})

describe('cleanExplanation', () => {
  it('太字と見出しの記号を取り除く', () => {
    expect(cleanExplanation('## 見出し\n**大事**な点です。')).toBe('見出し\n大事な点です。')
  })

  it('記号の無い文章はそのまま返す', () => {
    expect(cleanExplanation('【例題】\nそのままの文章です。')).toBe('【例題】\nそのままの文章です。')
  })
})
