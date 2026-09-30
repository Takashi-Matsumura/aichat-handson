import { describe, expect, it } from 'vitest'
import { readJsonObject } from './json'

const post = (body: string) => new Request('http://localhost/api', { method: 'POST', body })

describe('readJsonObject', () => {
  it('JSONオブジェクトを返す', async () => {
    expect(await readJsonObject(post('{"a":1}'))).toEqual({ a: 1 })
  })

  it.each([
    ['壊れたJSON', 'xx'],
    ['配列', '[1,2]'],
    ['文字列', '"text"'],
    ['null', 'null'],
    ['空の本文', ''],
  ])('%sなら null を返す', async (_, body) => {
    expect(await readJsonObject(post(body))).toBeNull()
  })
})
