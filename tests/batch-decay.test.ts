// tests/batch-decay.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import type { Engram } from '../src/core/types.js'
import { generateId } from '../src/core/id.js'
import { contentHash } from '../src/core/hash.js'
import { batchDecay } from '../src/lifecycle/batch-decay.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-decay-'))
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
    domain: 'test',
    tags: [],
    statement: 'Test',
    rationale: '',
    contraindications: [],
    entities: [],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { episode_id: null, quote: '', origin: 'test' },
    activation: { retrieval_strength: 0.9, storage_strength: 1.0, frequency: 1, last_accessed: today },
    emotional_weight: 5,
    confidence: 5,
    content_hash: contentHash('Test'),
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 1,
    ...overrides,
  }
}

describe('batchDecay', () => {
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

  it('skips recently accessed memories', () => {
    store.addEngram(makeEngram()) // accessed today
    const result = batchDecay(store)
    expect(result.processed).toBe(0) // skipped, accessed today
  })

  it('decays old memories', () => {
    const oldDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
    store.addEngram(makeEngram({
      activation: { retrieval_strength: 0.9, storage_strength: 1.0, frequency: 1, last_accessed: oldDate },
    }))

    const result = batchDecay(store)
    expect(result.processed).toBe(1)

    const eng = store.engrams[0]
    expect(eng.activation.retrieval_strength).toBeLessThan(0.9)
  })

  it('skips locked memories', () => {
    const oldDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
    store.addEngram(makeEngram({
      status: 'locked',
      activation: { retrieval_strength: 0.9, storage_strength: 1.0, frequency: 1, last_accessed: oldDate },
    }))

    const result = batchDecay(store)
    expect(result.processed).toBe(0)
  })

  it('detects status changes', () => {
    const oldDate = new Date(Date.now() - 100 * 86400_000).toISOString().slice(0, 10)
    store.addEngram(makeEngram({
      status: 'active',
      emotional_weight: 1, // fast decay
      activation: { retrieval_strength: 0.3, storage_strength: 1.0, frequency: 1, last_accessed: oldDate },
    }))

    const result = batchDecay(store)
    expect(result.statusChanges.length).toBeGreaterThan(0)
    expect(result.statusChanges[0].from).toBe('active')
  })
})
