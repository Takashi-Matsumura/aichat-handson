import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveManagedPath } from './loader'
import { RAG_CONFIG } from './config'

const root = path.resolve(RAG_CONFIG.knowledgeDir)

describe('resolveManagedPath', () => {
  it('知識フォルダ内の .md / .txt を絶対パスにする', () => {
    expect(resolveManagedPath('guide.md')).toBe(path.join(root, 'guide.md'))
    expect(resolveManagedPath('sub/notes.txt')).toBe(path.join(root, 'sub', 'notes.txt'))
  })

  it('先頭のスラッシュは知識フォルダからの相対として扱う', () => {
    expect(resolveManagedPath('/guide.md')).toBe(path.join(root, 'guide.md'))
  })

  it.each([
    ['親ディレクトリへの移動', '../secret.md'],
    ['途中での親ディレクトリへの移動', 'sub/../../secret.md'],
    ['対象外の拡張子', 'script.js'],
    ['README.md', 'README.md'],
    ['空文字', ''],
  ])('%sは拒否する', (_, relPath) => {
    expect(resolveManagedPath(relPath)).toBeNull()
  })
})
