// tests/bm25.test.ts
import { describe, it, expect } from 'vitest'
import { bm25Search } from '../src/search/bm25.js'

describe('bm25Search', () => {
  const docs = [
    { id: '1', text: 'Vitest 部分匹配要用 toMatchObject()，不是 toEqual()' },
    { id: '2', text: '使用 TypeScript 编写测试用例' },
    { id: '3', text: '用户偏好简洁直接的工作沟通' },
    { id: '4', text: 'BM25 检索算法实现' },
  ]

  it('returns relevant results for English query', () => {
    const results = bm25Search('Vitest toMatchObject', docs)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('1')
  })

  it('returns relevant results for Chinese query', () => {
    const results = bm25Search('测试用例', docs)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('2')
  })

  it('returns empty for unmatched query', () => {
    const results = bm25Search('xyznonexistent', docs)
    expect(results).toEqual([])
  })

  it('respects limit', () => {
    const results = bm25Search('test', docs, 1)
    expect(results.length).toBeLessThanOrEqual(1)
  })
})
