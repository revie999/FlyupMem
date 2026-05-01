// tests/tokenize.test.ts
import { describe, it, expect } from 'vitest'
import { tokenize, buildDFMap } from '../src/search/tokenize.js'

describe('tokenize', () => {
  it('tokenizes English words', () => {
    const tokens = tokenize('Hello World Test')
    expect(tokens).toContain('hello')
    expect(tokens).toContain('world')
    expect(tokens).toContain('test')
  })

  it('generates trigrams for Chinese', () => {
    const tokens = tokenize('测试文本')
    expect(tokens).toContain('测试文')
    expect(tokens).toContain('试文本')
    // bigrams too
    expect(tokens).toContain('测试')
    expect(tokens).toContain('文本')
  })

  it('handles mixed Chinese and English', () => {
    const tokens = tokenize('使用 Vitest 测试')
    expect(tokens).toContain('vitest')
    expect(tokens).toContain('测试')
    expect(tokens).toContain('使用')
  })

  it('returns empty for empty string', () => {
    expect(tokenize('')).toEqual([])
  })
})

describe('buildDFMap', () => {
  it('counts document frequency', () => {
    const docs = [
      ['hello', 'world'],
      ['hello', 'test'],
      ['world', 'test', 'foo'],
    ]
    const df = buildDFMap(docs)
    expect(df.get('hello')).toBe(2)
    expect(df.get('world')).toBe(2)
    expect(df.get('test')).toBe(2)
    expect(df.get('foo')).toBe(1)
  })
})
