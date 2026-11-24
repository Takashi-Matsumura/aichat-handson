import { describe, expect, it } from 'vitest'
import { RALLY_MAX_TOKENS, RALLY_SYSTEM_PROMPT, resolveMaxTokens } from './rally'

describe('resolveMaxTokens', () => {
  it('ラリーモードOFFなら通常の上限のまま', () => {
    expect(resolveMaxTokens(2048, { rally: false, thinking: false })).toBe(2048)
  })

  it('ラリーモードONなら上限をラリー用に下げる', () => {
    expect(resolveMaxTokens(2048, { rally: true, thinking: false })).toBe(RALLY_MAX_TOKENS)
  })

  it('通常の上限のほうが小さければ、そちらを使う(上限を引き上げない)', () => {
    expect(resolveMaxTokens(300, { rally: true, thinking: false })).toBe(300)
  })

  it('推論モード併用時は、思考過程で使い切らないよう通常の上限のまま', () => {
    expect(resolveMaxTokens(2048, { rally: true, thinking: true })).toBe(2048)
  })
})

describe('RALLY_SYSTEM_PROMPT', () => {
  it('問いを返すこと・明確に求められたら答えることを指示している', () => {
    expect(RALLY_SYSTEM_PROMPT).toContain('質問を1つだけ')
    expect(RALLY_SYSTEM_PROMPT).toContain('断らずに結論を')
  })
})
