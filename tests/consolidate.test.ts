// tests/consolidate.test.ts
import { describe, it, expect } from 'vitest'
import { hasPolarityConflict, mergeToObservation } from '../src/lifecycle/consolidate.js'
import type { Engram } from '../src/core/types.js'
import { generateId } from '../src/core/id.js'
import { contentHash } from '../src/core/hash.js'

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  const now = new Date().toISOString()
  return {
    id: generateId('raw'),
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
    tags: ['test'],
    statement: 'Use toMatchObject for partial matching',
    rationale: 'More flexible',
    contraindications: [],
    entities: [{ name: 'Vitest', type: 'tool' }],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { episode_id: null, quote: 'test quote', origin: 'test' },
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 2, last_accessed: now.slice(0, 10) },
    emotional_weight: 5,
    confidence: 6,
    content_hash: contentHash('test'),
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 1,
    ...overrides,
  }
}

describe('hasPolarityConflict', () => {
  it('detects do vs dont conflict', () => {
    const cluster = [
      makeEngram({ polarity: 'do' }),
      makeEngram({ polarity: 'dont' }),
    ]
    expect(hasPolarityConflict(cluster)).toBe(true)
  })

  it('returns false for same polarity', () => {
    const cluster = [
      makeEngram({ polarity: 'do' }),
      makeEngram({ polarity: 'do' }),
    ]
    expect(hasPolarityConflict(cluster)).toBe(false)
  })

  it('returns false for null polarity', () => {
    const cluster = [
      makeEngram({ polarity: null }),
      makeEngram({ polarity: null }),
    ]
    expect(hasPolarityConflict(cluster)).toBe(false)
  })
})

describe('mergeToObservation', () => {
  it('creates observation from cluster', () => {
    const cluster = [
      makeEngram({ id: 'ENG-001', statement: 'Use toMatchObject', confidence: 7 }),
      makeEngram({ id: 'ENG-002', statement: 'Use toMatchObject for partial', confidence: 8 }),
    ]

    const obs = mergeToObservation(cluster)

    expect(obs.layer).toBe('observation')
    expect(obs.source_memory_ids).toEqual(['ENG-001', 'ENG-002'])
    expect(obs.proof_count).toBe(2)
    expect(obs.evidence).toHaveLength(2)
    expect(obs.evidence[0].engram_id).toBe('ENG-001')
    expect(obs.status).toBe('active')
    expect(obs.trend).toBe('new')
  })

  it('merges tags from all engrams', () => {
    const cluster = [
      makeEngram({ tags: ['vitest', 'testing'] }),
      makeEngram({ tags: ['vitest', 'matching'] }),
    ]

    const obs = mergeToObservation(cluster)
    expect(obs.tags).toContain('vitest')
    expect(obs.tags).toContain('testing')
    expect(obs.tags).toContain('matching')
  })

  it('merges entities', () => {
    const cluster = [
      makeEngram({ entities: [{ name: 'Vitest', type: 'tool' }] }),
      makeEngram({ entities: [{ name: 'Vitest', type: 'tool' }, { name: 'TypeScript', type: 'language' }] }),
    ]

    const obs = mergeToObservation(cluster)
    const entityNames = obs.entities.map(e => e.name)
    expect(entityNames).toContain('Vitest')
    expect(entityNames).toContain('TypeScript')
  })

  it('takes highest confidence statement', () => {
    const cluster = [
      makeEngram({ statement: 'Short', confidence: 3 }),
      makeEngram({ statement: 'Longer detailed statement about matching', confidence: 8 }),
    ]

    const obs = mergeToObservation(cluster)
    expect(obs.statement).toBe('Longer detailed statement about matching')
  })
})
