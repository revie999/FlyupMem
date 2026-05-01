// tests/temporal.test.ts
import { describe, it, expect } from 'vitest'
import { temporalSearch, extractTimeReference } from '../src/search/temporal.js'
import type { Memory, GraphData } from '../src/core/types.js'

function makeMemory(id: string, learnedAt: string): Memory {
  return {
    id,
    version: 1,
    layer: 'raw',
    status: 'active',
    consolidated: false,
    type: 'procedural',
    memory_class: 'semantic',
    polarity: 'do',
    commitment: 'decided',
    scope: 'global',
    visibility: 'private',
    domain: 'test',
    tags: [],
    statement: `Memory ${id}`,
    rationale: '',
    contraindications: [],
    entities: [],
    temporal: { learned_at: learnedAt, valid_from: learnedAt, valid_until: null },
    source: { episode_id: null, quote: '', origin: 'test' },
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 1, last_accessed: learnedAt.slice(0, 10) },
    emotional_weight: 5,
    confidence: 5,
    content_hash: `hash-${id}`,
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 1,
  }
}

describe('extractTimeReference', () => {
  it('extracts ISO date', () => {
    expect(extractTimeReference('2026-05-01 发生了什么')).toBe('2026-05-01')
  })

  it('extracts "today"', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(extractTimeReference('今天学了什么')).toBe(today)
  })

  it('extracts "yesterday"', () => {
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
    expect(extractTimeReference('昨天做了什么')).toBe(yesterday)
  })

  it('returns null for no time reference', () => {
    expect(extractTimeReference('Vitest 测试')).toBeNull()
  })
})

describe('temporalSearch', () => {
  const today = new Date().toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString()

  const memories = [
    makeMemory('A', today),
    makeMemory('B', weekAgo),
    makeMemory('C', monthAgo),
  ]

  const emptyGraph: GraphData = { entities: {}, edges: [] }

  it('ranks recent memories higher', () => {
    const results = temporalSearch('今天', memories, emptyGraph)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('A')
  })

  it('finds memories from last week', () => {
    const results = temporalSearch('上周', memories, emptyGraph)
    expect(results.some(r => r.id === 'B')).toBe(true)
  })

  it('returns empty for no matches', () => {
    const results = temporalSearch('xyznoMatch', memories, emptyGraph, '2020-01-01')
    // All memories are too far from 2020
    expect(results.length).toBe(0)
  })

  it('BFS expands along temporal links', () => {
    const graph: GraphData = {
      entities: {},
      edges: [
        { from: 'A', to: 'B', type: 'temporal', weight: 0.8 },
      ],
    }

    const results = temporalSearch('今天', memories, graph)
    // A is found by time, B should be found via BFS
    expect(results.some(r => r.id === 'B')).toBe(true)
  })
})
