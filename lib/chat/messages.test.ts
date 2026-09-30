import { describe, expect, it } from 'vitest'
import {
  appendStreamChunk,
  deleteDisplayedVersion,
  displayedContent,
  finalizeStreamedMessage,
  navigateVersion,
  parseStreamLine,
  type Message,
} from './messages'

const assistant = (extra: Partial<Message> = {}): Message => ({ role: 'assistant', content: '', ...extra })

// 断片を順に流し込んだ結果を返す
const stream = (msg: Message, chunks: string[]) => finalizeStreamedMessage(chunks.reduce(appendStreamChunk, msg))

describe('parseStreamLine', () => {
  it('data行をJSONとして解析する', () => {
    expect(parseStreamLine('data: {"choices":[{"delta":{"content":"あ"}}]}')).toEqual({
      choices: [{ delta: { content: 'あ' } }],
    })
  })

  it.each([
    ['data行以外', ': ping'],
    ['[DONE]', 'data: [DONE]'],
    ['不正なJSON', 'data: {broken'],
  ])('%sは null', (_, line) => {
    expect(parseStreamLine(line)).toBeNull()
  })
})

describe('appendStreamChunk / finalizeStreamedMessage', () => {
  it('推論モードでなければ本文に追記する', () => {
    expect(stream(assistant(), ['こん', 'にちは']).content).toBe('こんにちは')
  })

  it('推論モードでは </think> までを思考過程、以降を本文に分ける', () => {
    const msg = stream(assistant({ thinkingEnabled: true }), ['<think>\n考え', '中です</th', 'ink>\n\n答え', 'です'])
    expect(msg.thinking).toBe('考え中です')
    expect(msg.content).toBe('答えです')
    expect(msg.thinkingDone).toBe(true)
    expect(msg.showThinking).toBe(true)
  })

  it('</think> が届くまでは本文を空にしておく', () => {
    const msg = appendStreamChunk(assistant({ thinkingEnabled: true }), '<think>考え中')
    expect(msg.thinking).toBe('考え中')
    expect(msg.content).toBe('')
    expect(msg.thinkingDone).toBe(false)
  })

  it('</think> が最後まで来なければ、溜めた内容を本文として扱う', () => {
    const msg = stream(assistant({ thinkingEnabled: true }), ['<think>\n閉じタグの', 'ない回答'])
    expect(msg.content).toBe('閉じタグのない回答')
    expect(msg.thinking).toBeUndefined()
    expect(msg.thinkingDone).toBe(true)
  })
})

describe('バージョン操作', () => {
  // 過去の回答 v1, v2 と最新の回答 v3
  const base = assistant({ content: 'v3', versions: ['v1', 'v2'] })

  it('最新版を表示しているときは content を表示する', () => {
    expect(displayedContent(base)).toBe('v3')
  })

  it('前後に切り替え、範囲外には出ない', () => {
    const prev = navigateVersion(base, -1)
    expect(prev.displayVersionIdx).toBe(1)
    expect(displayedContent(prev)).toBe('v2')
    expect(displayedContent(navigateVersion(navigateVersion(prev, -1), -1))).toBe('v1')
    expect(navigateVersion(prev, 1).displayVersionIdx).toBeUndefined()
    expect(navigateVersion(base, 1).displayVersionIdx).toBeUndefined()
  })

  it('最新版を削除すると、ひとつ前が最新になる', () => {
    const msg = deleteDisplayedVersion(base)
    expect(msg.content).toBe('v2')
    expect(msg.versions).toEqual(['v1'])
    expect(msg.displayVersionIdx).toBeUndefined()
  })

  it('過去バージョンを削除すると、ひとつ前のバージョンを表示する', () => {
    const msg = deleteDisplayedVersion(navigateVersion(base, -1)) // v2 を削除
    expect(msg.versions).toEqual(['v1'])
    expect(msg.content).toBe('v3')
    expect(displayedContent(msg)).toBe('v1')
  })

  it('最後の過去バージョンを削除すると versions がなくなる', () => {
    const one = assistant({ content: 'v2', versions: ['v1'] })
    const msg = deleteDisplayedVersion(navigateVersion(one, -1))
    expect(msg.versions).toBeUndefined()
    expect(msg.displayVersionIdx).toBeUndefined()
    expect(displayedContent(msg)).toBe('v2')
  })

  it('バージョンがなければ何もしない', () => {
    const msg = assistant({ content: 'only' })
    expect(navigateVersion(msg, -1)).toBe(msg)
    expect(deleteDisplayedVersion(msg)).toBe(msg)
  })
})
