import { describe, expect, it } from 'vitest'
import { buildQueryPrompt, cleanQuery, fallbackQuery } from './query'

describe('cleanQuery', () => {
  it('最初の空でない行だけを取り、ラベルと引用符を除く', () => {
    expect(cleanQuery('\n検索クエリ: 「Next.js 16 新機能」\n説明…')).toBe('Next.js 16 新機能')
  })

  it('思考タグを取り除く', () => {
    expect(cleanQuery('<think>考え中</think>\n東京 天気 明日')).toBe('東京 天気 明日')
  })

  it('長すぎるクエリは200文字に切る', () => {
    expect(cleanQuery('あ'.repeat(300)).length).toBe(200)
  })

  it('空なら空文字', () => {
    expect(cleanQuery('  \n ')).toBe('')
  })
})

describe('fallbackQuery', () => {
  it('最後のユーザー発言を1行にして使う', () => {
    expect(fallbackQuery([
      { role: 'user', content: '古い質問' },
      { role: 'assistant', content: '回答' },
      { role: 'user', content: '最新の\nニュースは？' },
    ])).toBe('最新の ニュースは？')
  })
})

describe('buildQueryPrompt', () => {
  it('直近6件だけを会話として渡し、日付を含める', () => {
    const messages = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `m${i}`,
    }))
    const { system, user } = buildQueryPrompt(messages, '2026年11月23日')
    expect(system).toContain('2026年11月23日')
    expect(user).not.toContain('m0')
    expect(user).not.toContain('m1')
    expect(user).toContain('ユーザー: m2')
    expect(user).toContain('AI: m7')
  })
})
