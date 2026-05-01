// tests/inspect.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import { flyupInspect } from '../src/tools/flyup_inspect.js'
import type { Engram } from '../src/core/types.js'
import { generateId } from '../src/core/id.js'
import { contentHash } from '../src/core/hash.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-inspect-'))
}

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
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
    domain: 'testing',
    tags: ['test', 'inspect'],
    statement: 'Test statement for inspect',
    rationale: 'Test rationale',
    contraindications: [],
    entities: [],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { episode_id: null, quote: 'test quote', origin: 'test' },
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 3, last_accessed: today },
    emotional_weight: 6,
    confidence: 8,
    content_hash: contentHash('Test statement for inspect'),
    associations: [],
    feedback: { positive: 2, negative: 0, neutral: 1 },
    previous_version_ref: null,
    derivation_count: 1,
    ...overrides,
  }
}

describe('flyupInspect', () => {
  let tmp: string
  let store: FlyupMemStore

  beforeEach(() => {
    tmp = tmpDir()
    store = new FlyupMemStore({ store_path: tmp })
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns found=false for non-existent ID', () => {
    store.load()
    const result = flyupInspect('NONEXISTENT-001', store)
    expect(result.found).toBe(false)
    expect(result.error).toContain('NONEXISTENT-001')
  })

  it('returns full detail for an existing engram', () => {
    const e = makeEngram({ id: 'INSPECT-001' })
    store.addEngram(e)
    store.save()

    const freshStore = new FlyupMemStore({ store_path: tmp })
    const result = flyupInspect('INSPECT-001', freshStore)

    expect(result.found).toBe(true)
    const m = result.memory!
    expect(m.id).toBe('INSPECT-001')
    expect(m.layer).toBe('raw')
    expect(m.status).toBe('active')
    expect(m.statement).toBe('Test statement for inspect')
    expect(m.type).toBe('procedural')
    expect(m.memoryClass).toBe('semantic')
    expect(m.polarity).toBe('do')
    expect(m.scope).toBe('global')
    expect(m.domain).toBe('testing')
    expect(m.tags).toContain('test')
    expect(m.tags).toContain('inspect')
  })

  it('computes current activation values', () => {
    const e = makeEngram({
      id: 'ACT-001',
      activation: { retrieval_strength: 0.9, storage_strength: 1.0, frequency: 5, last_accessed: '2026-05-01' },
    })
    store.addEngram(e)
    store.save()

    const freshStore = new FlyupMemStore({ store_path: tmp })
    const result = flyupInspect('ACT-001', freshStore)

    expect(result.found).toBe(true)
    const act = result.memory!.activation
    expect(act.retrievalStrength).toBe(0.9)
    expect(act.storageStrength).toBe(1.0)
    expect(act.frequency).toBe(5)
    expect(act.computedActivation).toBeGreaterThan(0)
    expect(act.computedActivation).toBeLessThanOrEqual(1)
    expect(act.effectiveDecay).toBeGreaterThan(0)
    expect(act.layer).toBe('raw')
    expect(act.layerLevel).toBe(3)
  })

  it('shows related memories via associations', () => {
    const e1 = makeEngram({ id: 'REL-001', statement: 'First memory' })
    const e2 = makeEngram({ id: 'REL-002', statement: 'Second memory', associations: [{ target: 'REL-001', type: 'semantic', weight: 0.7 }] })
    store.addEngram(e1)
    store.addEngram(e2)
    store.save()

    const freshStore = new FlyupMemStore({ store_path: tmp })
    const result = flyupInspect('REL-002', freshStore)

    expect(result.found).toBe(true)
    expect(result.memory!.related).toHaveLength(1)
    expect(result.memory!.related[0].id).toBe('REL-001')
    expect(result.memory!.related[0].relationType).toBe('semantic')
    expect(result.memory!.related[0].weight).toBe(0.7)
  })

  it('shows graph edges (outgoing and incoming)', () => {
    const e1 = makeEngram({ id: 'G-001' })
    const e2 = makeEngram({ id: 'G-002' })
    store.addEngram(e1)
    store.addEngram(e2)
    store.addEdge('G-001', 'G-002', 'semantic', 0.6)
    store.addEdge('G-002', 'G-001', 'causal', 0.4)
    store.save()

    const freshStore = new FlyupMemStore({ store_path: tmp })
    const result = flyupInspect('G-001', freshStore)

    expect(result.found).toBe(true)
    const edges = result.memory!.graphEdges
    expect(edges).toHaveLength(2)
    const outgoing = edges.filter(e => e.direction === 'outgoing')
    const incoming = edges.filter(e => e.direction === 'incoming')
    expect(outgoing).toHaveLength(1)
    expect(incoming).toHaveLength(1)
  })

  it('shows feedback summary', () => {
    const e = makeEngram({ id: 'FB-001', feedback: { positive: 3, negative: 1, neutral: 2 } })
    store.addEngram(e)
    store.save()

    const freshStore = new FlyupMemStore({ store_path: tmp })
    const result = flyupInspect('FB-001', freshStore)

    expect(result.found).toBe(true)
    expect(result.memory!.feedback.positive).toBe(3)
    expect(result.memory!.feedback.negative).toBe(1)
    expect(result.memory!.feedback.neutral).toBe(2)
  })

  it('includes temporal info', () => {
    const e = makeEngram({ id: 'TEMP-001' })
    store.addEngram(e)
    store.save()

    const freshStore = new FlyupMemStore({ store_path: tmp })
    const result = flyupInspect('TEMP-001', freshStore)

    expect(result.found).toBe(true)
    expect(result.memory!.learnedAt).toBeTruthy()
    expect(result.memory!.ageDays).toBeGreaterThanOrEqual(0)
    expect(result.memory!.lastAccessed).toBeTruthy()
    expect(result.memory!.daysSinceAccess).toBeGreaterThanOrEqual(0)
  })
})
