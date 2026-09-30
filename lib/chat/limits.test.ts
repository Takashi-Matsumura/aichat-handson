import { describe, expect, it } from 'vitest'
import { MAX_MESSAGES, MAX_TOTAL_CHARS, parseMessages } from './limits'

describe('parseMessages', () => {
  it('user/assistant のメッセージを受け付ける', () => {
    const messages = [
      { role: 'user', content: 'こんにちは' },
      { role: 'assistant', content: 'こんにちは！' },
    ]
    expect(parseMessages(messages)).toEqual(messages)
  })

  it('余分なフィールドは落とす', () => {
    expect(parseMessages([{ role: 'user', content: 'a', extra: 1 }])).toEqual([{ role: 'user', content: 'a' }])
  })

  it.each([
    ['配列でない', 'text'],
    ['空配列', []],
    ['system ロール', [{ role: 'system', content: 'x' }, { role: 'user', content: 'hi' }]],
    ['content が文字列でない', [{ role: 'user', content: 1 }]],
    ['要素がオブジェクトでない', ['hi']],
    [`${MAX_MESSAGES + 1}件`, Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: 'user', content: 'a' }))],
  ])('%sは拒否する', (_, input) => {
    expect(parseMessages(input)).toBeNull()
  })

  it('合計文字数が上限ちょうどなら受け付け、1文字でも超えたら拒否する', () => {
    const half = MAX_TOTAL_CHARS / 2
    const ok = [{ role: 'user', content: 'a'.repeat(half) }, { role: 'assistant', content: 'b'.repeat(half) }]
    expect(parseMessages(ok)).not.toBeNull()
    const over = [...ok, { role: 'user', content: 'c' }]
    expect(parseMessages(over)).toBeNull()
  })
})
