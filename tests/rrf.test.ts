// tests/rrf.test.ts
import { describe, it, expect } from 'vitest'
import { rrfMerge } from '../src/search/rrf.js'

describe('rrfMerge', () => {
  it('merges two ranked lists', () => {
    const list1 = [
      { id: 'A', score: 1.0 },
      { id: 'B', score: 0.8 },
      { id: 'C', score: 0.5 },
    ]
    const list2 = [
      { id: 'B', score: 1.0 },
      { id: 'D', score: 0.9 },
      { id: 'A', score: 0.3 },
    ]

    const merged = rrfMerge([list1, list2])

    // B appears in top of both lists → should be ranked highest
    expect(merged[0].id).toBe('B')
    // A appears in both lists too
    const aIdx = merged.findIndex(r => r.id === 'A')
    const dIdx = merged.findIndex(r => r.id === 'D')
    expect(aIdx).toBeLessThan(dIdx) // A in both lists, D only in list2
  })

  it('handles empty lists', () => {
    const merged = rrfMerge([[], []])
    expect(merged).toEqual([])
  })

  it('handles single list', () => {
    const list = [
      { id: 'X', score: 1.0 },
      { id: 'Y', score: 0.5 },
    ]
    const merged = rrfMerge([list])
    expect(merged[0].id).toBe('X')
    expect(merged[1].id).toBe('Y')
  })

  it('preserves relative order from consensus', () => {
    // Three lists all agree A > B
    const list = [
      { id: 'A', score: 1.0 },
      { id: 'B', score: 0.5 },
    ]
    const merged = rrfMerge([list, list, list])
    expect(merged[0].id).toBe('A')
    expect(merged[1].id).toBe('B')
  })
})
