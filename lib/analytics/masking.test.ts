import { describe, expect, it } from 'vitest'
import { maskText } from './masking'

describe('maskText', () => {
  it('メールアドレス・電話番号・カード番号・パスワード・社内URLを置換する', () => {
    const { masked, matches } = maskText(
      '連絡先 taro.yamada+test@example.co.jp / 03-1234-5678 / 4111 1111 1111 1111 / password: hunter2 / http://192.168.1.10/admin'
    )
    expect(masked).toBe(
      '連絡先 [MASKED:EMAIL] / [MASKED:PHONE] / [MASKED:CREDIT_CARD] / [MASKED:PASSWORD] / [MASKED:INTERNAL_URL]'
    )
    expect(matches.map(m => m.rule).sort()).toEqual(['CREDIT_CARD', 'EMAIL', 'INTERNAL_URL', 'PASSWORD', 'PHONE'])
  })

  it('APIキーらしき文字列を置換する', () => {
    expect(maskText('api_key=abcdefghijklmnop1234').masked).toBe('[MASKED:API_KEY]')
  })

  it('該当しない文章はそのまま返す', () => {
    const text = '会議の議事録を要約してください。'
    expect(maskText(text)).toEqual({ masked: text, matches: [] })
  })

  // "@" を含まない英数字の長い連続で処理時間が文字数の2乗になっていた不具合の再発防止。
  it.each([
    ['英字の連続', 'a'.repeat(30_000)],
    ['数字の連続', '0'.repeat(30_000)],
    ['"a@" + ドットの連続', 'a@' + '.'.repeat(30_000)],
  ])('%s(3万文字)でも短時間で終わる', (_, input) => {
    const start = performance.now()
    maskText(input)
    expect(performance.now() - start).toBeLessThan(100)
  })
})
