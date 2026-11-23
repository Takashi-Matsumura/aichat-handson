import { describe, expect, it } from 'vitest'
import { buildRagQueryPrompt, parseRagQueries } from './query'

describe('parseRagQueries', () => {
  it('1行に1つの検索文を取り出し、番号・記号・重複を除く', () => {
    const raw = '1. リモートワーク手当の金額\n- 在宅勤務 補助\n・「リモートワーク手当の金額」\n\n検索文: 通信費 光熱費 補助'
    expect(parseRagQueries(raw, 5)).toEqual(['リモートワーク手当の金額', '在宅勤務 補助', '通信費 光熱費 補助'])
  })

  it('思考タグを取り除き、指定した数で打ち切る', () => {
    const raw = '<think>考え中</think>\n誕生日休暇 申請期限\n特別休暇 申請\n休暇 申請方法'
    expect(parseRagQueries(raw, 2)).toEqual(['誕生日休暇 申請期限', '特別休暇 申請'])
  })

  it('空の出力なら空配列', () => {
    expect(parseRagQueries('  \n ', 3)).toEqual([])
  })
})

describe('buildRagQueryPrompt', () => {
  it('直近の会話と、作る数を含める', () => {
    const { system, user } = buildRagQueryPrompt(
      [
        { role: 'user', content: '誕生日休暇はありますか？' },
        { role: 'assistant', content: 'あります。' },
        { role: 'user', content: 'それはいつまでに申請？' },
      ],
      3,
    )
    expect(system).toContain('最大3個')
    expect(user).toContain('ユーザー: それはいつまでに申請？')
    expect(user).toContain('AI: あります。')
  })
})
