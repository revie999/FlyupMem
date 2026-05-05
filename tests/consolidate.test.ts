// tests/consolidate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { findMatchingObservation, hasPolarityConflict, mergeToObservation, updateObservationFromCluster } from '../src/lifecycle/consolidate.js'
import { FlyupMemStore } from '../src/core/store.js'
import type { Engram } from '../src/core/types.js'
import { generateId } from '../src/core/id.js'
import { contentHash } from '../src/core/hash.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-consolidate-'))
}

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
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 2, turn_count: 1, last_accessed: now.slice(0, 10) },
    emotional_weight: 5,
    confidence: 6,
    content_hash: contentHash('test'),
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 1,
    adoption_count: 0,
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

describe('Observation incremental upgrade', () => {
  let dir: string
  let store: FlyupMemStore

  beforeEach(() => {
    dir = tmpDir()
    store = new FlyupMemStore({ store_path: dir })
    store.load()
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('finds an existing observation by same scope/domain and shared entity', () => {
    const original = mergeToObservation([
      makeEngram({ id: 'ENG-OLD-1', statement: 'Prefer local reliable storage for FlyupMem', entities: [{ name: 'FlyupMem', type: 'project' }] }),
      makeEngram({ id: 'ENG-OLD-2', statement: 'FlyupMem should prioritize local reliability', entities: [{ name: 'FlyupMem', type: 'project' }] }),
    ])
    store.addObservation(original)

    const match = findMatchingObservation([
      makeEngram({ id: 'ENG-NEW-1', statement: 'FlyupMem local store reliability matters most', entities: [{ name: 'FlyupMem', type: 'project' }] }),
      makeEngram({ id: 'ENG-NEW-2', statement: 'Keep FlyupMem maintenance local-first', entities: [{ name: 'FlyupMem', type: 'project' }] }),
    ], store)

    expect(match?.id).toBe(original.id)
  })

  it('updates proof/evidence/tags/history without creating a duplicate observation', () => {
    const original = mergeToObservation([
      makeEngram({ id: 'ENG-OLD-1', tags: ['local'], statement: 'Prefer local reliable storage for FlyupMem' }),
      makeEngram({ id: 'ENG-OLD-2', tags: ['reliable'], statement: 'FlyupMem should prioritize local reliability' }),
    ])
    store.addObservation(original)

    const updated = updateObservationFromCluster(original, [
      makeEngram({ id: 'ENG-OLD-1' }),
      makeEngram({ id: 'ENG-NEW-1', tags: ['maintenance'], statement: 'FlyupMem maintenance should stay local-first' }),
    ], store)

    expect(store.observations).toHaveLength(1)
    expect(updated.source_memory_ids).toContain('ENG-NEW-1')
    expect(updated.source_memory_ids.filter(id => id === 'ENG-OLD-1')).toHaveLength(1)
    expect(updated.proof_count).toBe(3)
    expect(updated.evidence.map(e => e.engram_id)).toContain('ENG-NEW-1')
    expect(updated.tags).toContain('maintenance')
    expect(updated.trend).toBe('strengthening')
    expect(updated.history.at(-1)?.event).toBe('updated')
  })
})
