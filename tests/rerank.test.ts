// tests/rerank.test.ts
import { describe, it, expect } from 'vitest'
import { localRerank } from '../src/search/rerank.js'
import type { Memory } from '../src/core/types.js'

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date().toISOString()
  return {
    id: 'test-1',
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
    statement: 'Test memory statement',
    rationale: '',
    contraindications: [],
    entities: [],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { episode_id: null, quote: '', origin: 'test' },
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 5, last_accessed: now.slice(0, 10) },
    emotional_weight: 5,
    confidence: 7,
    content_hash: 'hash-test',
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 1,
    ...overrides,
  } as Memory
}

describe('localRerank', () => {
  it('ranks higher confidence + recent + high relevance higher', () => {
    const memHigh = makeMemory({
      id: 'high',
      confidence: 9,
      statement: 'A very detailed and specific memory with lots of context about Vitest matching behavior in TypeScript projects',
    })
    const memLow = makeMemory({
      id: 'low',
      confidence: 3,
      statement: 'Short',
    })

    const results = localRerank([
      { memory: memHigh, relevanceScore: 0.9 },
      { memory: memLow, relevanceScore: 0.9 },
    ])

    expect(results[0].id).toBe('high')
  })

  it('considers polarity', () => {
    const memDo = makeMemory({ id: 'do', polarity: 'do' })
    const memDont = makeMemory({ id: 'dont', polarity: 'dont' })

    const results = localRerank([
      { memory: memDo, relevanceScore: 0.5 },
      { memory: memDont, relevanceScore: 0.5 },
    ])

    expect(results[0].id).toBe('do')
  })

  it('handles scope matching', () => {
    const memGlobal = makeMemory({ id: 'global', scope: 'global' })
    const memProject = makeMemory({ id: 'project', scope: 'project:flyupmem' })

    const results = localRerank([
      { memory: memGlobal, relevanceScore: 0.5 },
      { memory: memProject, relevanceScore: 0.5 },
    ], 'project:flyupmem')

    // Project-scoped memory matches query scope → higher
    expect(results[0].id).toBe('project')
  })

  it('returns results sorted by score', () => {
    const memories = Array.from({ length: 5 }, (_, i) =>
      makeMemory({ id: `m${i}`, confidence: i + 1 }),
    )

    const results = localRerank(
      memories.map(m => ({ memory: m, relevanceScore: 0.5 })),
    )

    // Should be sorted descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })
})
