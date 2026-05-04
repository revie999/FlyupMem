// tests/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import type { Engram } from '../src/core/types.js'
import { generateId } from '../src/core/id.js'
import { contentHash } from '../src/core/hash.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-test-'))
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
    tags: ['test'],
    statement: 'Use toMatchObject for partial matching',
    rationale: 'toEqual does strict comparison',
    contraindications: [],
    entities: [],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { episode_id: null, quote: 'test', origin: 'test' },
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 1, last_accessed: today },
    emotional_weight: 5,
    confidence: 7,
    content_hash: contentHash('Use toMatchObject for partial matching'),
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 1,
    ...overrides,
  }
}

describe('FlyupMemStore', () => {
  let dir: string
  let store: FlyupMemStore

  beforeEach(() => {
    dir = tmpDir()
    store = new FlyupMemStore({ store_path: dir })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('loads empty store without error', () => {
    store.load()
    expect(store.engrams).toEqual([])
    expect(store.observations).toEqual([])
  })

  it('adds and persists engram', () => {
    store.load()
    const eng = makeEngram()
    store.addEngram(eng)
    store.save()

    const store2 = new FlyupMemStore({ store_path: dir })
    store2.load()
    expect(store2.engrams).toHaveLength(1)
    expect(store2.engrams[0].id).toBe(eng.id)
    expect(store2.engrams[0].statement).toBe(eng.statement)
  })

  it('merges non-overlapping writes from stale store instances', () => {
    const storeA = new FlyupMemStore({ store_path: dir })
    const storeB = new FlyupMemStore({ store_path: dir })
    storeA.load()
    storeB.load()

    storeA.addEngram(makeEngram({ id: 'ENG-20260504-101', statement: 'A writes first', content_hash: contentHash('A writes first') }))
    storeA.save()

    storeB.addEngram(makeEngram({ id: 'ENG-20260504-102', statement: 'B writes second', content_hash: contentHash('B writes second') }))
    storeB.save()

    const fresh = new FlyupMemStore({ store_path: dir })
    fresh.load()
    expect(fresh.engrams.map(e => e.id)).toEqual(expect.arrayContaining(['ENG-20260504-101', 'ENG-20260504-102']))
  })

  it('records checkpoints and produces recovery context', () => {
    store.load()
    store.captureEpisodeSummary('记住：端口是 7897', '好的', ['ENG-1'], {
      agent: 'test',
      channel: 'unit',
      tags: ['summary'],
    })
    store.captureCheckpoint('tests-passed', {
      summary: 'TypeScript tests passed',
      next_steps: ['open PR'],
    })
    store.save()

    const fresh = new FlyupMemStore({ store_path: dir })
    const context = fresh.getRecoveryContext()
    expect(context).toContain('Recent FlyupMem Session Context')
    expect(context).toContain('TypeScript tests passed')
    expect(context).toContain('next: open PR')
  })

  it('finds by hash', () => {
    store.load()
    const eng = makeEngram()
    store.addEngram(eng)
    const found = store.findByHash(eng.content_hash)
    expect(found).toBeDefined()
    expect(found!.id).toBe(eng.id)
  })

  it('updates engram', () => {
    store.load()
    const eng = makeEngram()
    store.addEngram(eng)
    store.updateEngram(eng.id, { confidence: 10 })
    expect(store.getEngramById(eng.id)!.confidence).toBe(10)
  })

  it('returns stats', () => {
    store.load()
    store.addEngram(makeEngram({ status: 'active' }))
    store.addEngram(makeEngram({ status: 'candidate' }))
    const stats = store.stats()
    expect(stats.engrams.total).toBe(2)
    expect(stats.engrams.active).toBe(1)
    expect(stats.engrams.candidate).toBe(1)
  })

  it('honors FLYUPMEM_STORE_PATH when no explicit config is provided', () => {
    const envDir = tmpDir()
    const previous = process.env.FLYUPMEM_STORE_PATH
    process.env.FLYUPMEM_STORE_PATH = envDir

    try {
      const envStore = new FlyupMemStore()
      expect(envStore.basePath).toBe(envDir)
    } finally {
      if (previous === undefined) {
        delete process.env.FLYUPMEM_STORE_PATH
      } else {
        process.env.FLYUPMEM_STORE_PATH = previous
      }
      fs.rmSync(envDir, { recursive: true, force: true })
    }
  })

  it('health check passes on clean store', () => {
    store.load()
    const h = store.healthCheck()
    expect(h.ok).toBe(true)
  })
})
