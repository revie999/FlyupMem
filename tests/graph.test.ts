// tests/graph.test.ts
import { describe, it, expect } from 'vitest'
import { graphExpansion } from '../src/search/graph.js'
import type { Memory, GraphData } from '../src/core/types.js'

function makeMemory(id: string, entities: Array<{ name: string; type: string }> = []): Memory {
  const now = new Date().toISOString()
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
    entities,
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { episode_id: null, quote: '', origin: 'test' },
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 1, last_accessed: now.slice(0, 10) },
    emotional_weight: 5,
    confidence: 5,
    content_hash: `hash-${id}`,
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 1,
  }
}

describe('graphExpansion', () => {
  it('finds memories sharing entities', () => {
    const memories = [
      makeMemory('A', [{ name: 'Vitest', type: 'tool' }]),
      makeMemory('B', [{ name: 'Vitest', type: 'tool' }, { name: 'TypeScript', type: 'language' }]),
      makeMemory('C', [{ name: 'Jest', type: 'tool' }]),
    ]

    const graph: GraphData = {
      entities: {
        Vitest: { type: 'tool', memory_ids: ['A', 'B'] },
        TypeScript: { type: 'language', memory_ids: ['B'] },
        Jest: { type: 'tool', memory_ids: ['C'] },
      },
      edges: [],
    }

    const results = graphExpansion(['A'], memories, graph)
    // B shares Vitest with A
    expect(results.some(r => r.id === 'B')).toBe(true)
    // C doesn't share entities with A
    expect(results.some(r => r.id === 'C')).toBe(false)
  })

  it('follows semantic links', () => {
    const memories = [
      makeMemory('A'),
      makeMemory('B'),
    ]

    const graph: GraphData = {
      entities: {},
      edges: [
        { from: 'A', to: 'B', type: 'semantic', weight: 0.8 },
      ],
    }

    const results = graphExpansion(['A'], memories, graph)
    expect(results[0].id).toBe('B')
    expect(results[0].score).toBeCloseTo(0.8)
  })

  it('follows semantic links in reverse direction', () => {
    const memories = [
      makeMemory('A'),
      makeMemory('B'),
    ]

    const graph: GraphData = {
      entities: {},
      edges: [
        { from: 'A', to: 'B', type: 'semantic', weight: 0.8 },
      ],
    }

    // Expanding from B should find A via the reverse of A→B
    const results = graphExpansion(['B'], memories, graph)
    expect(results[0].id).toBe('A')
    expect(results[0].score).toBeCloseTo(0.8)
  })

  it('boosts causal links', () => {
    const memories = [
      makeMemory('A'),
      makeMemory('B'),
    ]

    const graph: GraphData = {
      entities: {},
      edges: [
        { from: 'A', to: 'B', type: 'causal', weight: 0.5 },
      ],
    }

    const results = graphExpansion(['A'], memories, graph)
    // Causal gets +1.0 boost: 0.5 + 1.0 = 1.5
    expect(results[0].score).toBeCloseTo(1.5)
  })

  it('returns empty for no connections', () => {
    const memories = [makeMemory('A')]
    const graph: GraphData = { entities: {}, edges: [] }
    const results = graphExpansion(['A'], memories, graph)
    expect(results).toEqual([])
  })
})
