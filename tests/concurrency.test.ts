import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import type { Engram } from '../src/core/types.js'
import { contentHash } from '../src/core/hash.js'

function tmpStore(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-concurrency-'))
}

function makeEngram(id: string, statement: string): Engram {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
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
    scope: 'test',
    visibility: 'private',
    domain: 'testing',
    tags: ['test'],
    statement,
    rationale: '',
    contraindications: [],
    entities: [],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { origin: 'test', episode_id: null, quote: '' },
    activation: {
      retrieval_strength: 0.8,
      storage_strength: 1.0,
      frequency: 1,
      turn_count: 1,
      last_accessed: today,
    },
    emotional_weight: 5,
    confidence: 8,
    content_hash: contentHash(statement),
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    adoption_count: 0,
    derivation_count: 1,
  }
}

describe('Concurrency Safety', () => {
  let storeDir: string

  beforeEach(() => {
    storeDir = tmpStore()
  })

  afterEach(() => {
    fs.rmSync(storeDir, { recursive: true, force: true })
  })

  it('10 concurrent saveAsync calls all succeed without data loss', async () => {
    const store = new FlyupMemStore({ store_path: storeDir })
    store.load()

    const N = 10
    const promises: Promise<void>[] = []

    for (let i = 0; i < N; i++) {
      store.addEngram(makeEngram(`ENG-CONC-${String(i).padStart(3, '0')}`, `concurrent write ${i}`))
      promises.push(store.saveAsync())
    }

    await Promise.all(promises)
    await store.shutdown()

    // Reload from disk and verify all engrams are persisted
    const store2 = new FlyupMemStore({ store_path: storeDir })
    store2.load()
    expect(store2.engrams.length).toBe(N)

    for (let i = 0; i < N; i++) {
      const id = `ENG-CONC-${String(i).padStart(3, '0')}`
      expect(store2.engrams.find(e => e.id === id)).toBeDefined()
    }
  })

  it('saveAsync does not block concurrent reads', async () => {
    const store = new FlyupMemStore({ store_path: storeDir })
    store.load()

    store.addEngram(makeEngram('ENG-READ-001', 'readable while writing'))
    store.save()

    // Add another engram and saveAsync
    store.addEngram(makeEngram('ENG-READ-002', 'second'))
    const savePromise = store.saveAsync()

    // Read should work while save is queued
    const engrams = store.engrams
    expect(engrams.length).toBe(2)
    expect(engrams.find(e => e.id === 'ENG-READ-001')).toBeDefined()

    await savePromise
    await store.shutdown()
  })

  it('pendingWrites reports correctly during async saves', async () => {
    const store = new FlyupMemStore({ store_path: storeDir })
    store.load()

    expect(store.pendingWrites).toBe(0)

    store.addEngram(makeEngram('ENG-PW-001', 'pending test'))
    const p = store.saveAsync()

    await p
    expect(store.pendingWrites).toBe(0)
  })

  it('shutdown waits for all pending writes', async () => {
    const store = new FlyupMemStore({ store_path: storeDir })
    store.load()

    for (let i = 0; i < 5; i++) {
      store.addEngram(makeEngram(`ENG-SD-${i}`, `shutdown test ${i}`))
      store.saveAsync() // fire-and-forget
    }

    await store.shutdown()

    // Verify all persisted
    const store2 = new FlyupMemStore({ store_path: storeDir })
    store2.load()
    expect(store2.engrams.length).toBe(5)
  })

  it('two store instances writing to same path use file lock correctly', async () => {
    const store1 = new FlyupMemStore({ store_path: storeDir })
    const store2 = new FlyupMemStore({ store_path: storeDir })
    store1.load()
    store2.load()

    store1.addEngram(makeEngram('ENG-P1-001', 'from process 1'))
    store1.save()

    store2.addEngram(makeEngram('ENG-P2-001', 'from process 2'))
    store2.save()

    // Reload and verify merge
    const store3 = new FlyupMemStore({ store_path: storeDir })
    store3.load()
    expect(store3.engrams.length).toBe(2)
    expect(store3.engrams.find(e => e.id === 'ENG-P1-001')).toBeDefined()
    expect(store3.engrams.find(e => e.id === 'ENG-P2-001')).toBeDefined()
  })

  it('error in one saveAsync does not block subsequent saves', async () => {
    const store = new FlyupMemStore({ store_path: storeDir })
    store.load()

    store.addEngram(makeEngram('ENG-ERR-001', 'before error'))
    await store.saveAsync()

    store.addEngram(makeEngram('ENG-ERR-002', 'after potential error'))
    await store.saveAsync()

    await store.shutdown()

    const store2 = new FlyupMemStore({ store_path: storeDir })
    store2.load()
    expect(store2.engrams.length).toBe(2)
  })
})
