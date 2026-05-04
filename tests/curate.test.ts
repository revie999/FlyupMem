// tests/curate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import { flyupReview, flyupPrune } from '../src/tools/flyup_curate.js'
import type { Engram } from '../src/core/types.js'
import { contentHash } from '../src/core/hash.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-curate-'))
}

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const statement = overrides.statement ?? '主人偏好直接给结论。'
  return {
    id: overrides.id ?? `ENG-CURATE-${Math.random().toString(16).slice(2, 8)}`,
    version: 1,
    layer: 'raw',
    status: 'active',
    consolidated: false,
    type: 'behavioral',
    memory_class: 'semantic',
    polarity: null,
    commitment: 'decided',
    scope: 'global',
    visibility: 'private',
    domain: 'user-preference',
    tags: [],
    statement,
    rationale: '',
    contraindications: [],
    entities: [],
    temporal: { learned_at: now, valid_from: today, valid_until: null },
    source: { episode_id: null, quote: statement, origin: 'hermes:telegram' },
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 1, turn_count: 0, last_accessed: today },
    emotional_weight: 5,
    confidence: 7,
    content_hash: contentHash(statement),
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    adoption_count: 0,
    previous_version_ref: null,
    derivation_count: 1,
    ...overrides,
  }
}

describe('flyupCurate', () => {
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

  it('review flags dogfood and marker memories but not normal preferences', () => {
    store.addEngram(makeEngram({ id: 'NORMAL-001', statement: '主人偏好结构化清单式分析。' }))
    store.addEngram(makeEngram({
      id: 'DOGFOOD-001',
      statement: 'telegram-live-restart-20260501-2309 marker should not be recalled daily',
      tags: ['dogfood'],
      domain: 'testing',
    }))
    store.save()

    const result = flyupReview(store)

    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe('DOGFOOD-001')
    expect(result.items[0].reasons.join(' ')).toContain('dogfood/test tag')
    expect(result.items[0].reasons.join(' ')).toContain('test marker')
    expect(result.items.map(i => i.id)).not.toContain('NORMAL-001')
  })

  it('review flags terse engineering fragments from debugging/review sessions', () => {
    store.addEngram(makeEngram({ id: 'NORMAL-PORT', statement: 'Clash 端口是 7897。', domain: 'environment/runtime', tags: ['port'] }))
    store.addEngram(makeEngram({ id: 'FRAG-001', statement: '不是真 persistence。', confidence: 5, domain: 'general' }))
    store.addEngram(makeEngram({ id: 'FRAG-002', statement: '不要 mutate 原对象。', confidence: 5, domain: 'general' }))
    store.addEngram(makeEngram({ id: 'FRAG-003', statement: '默认大规模 benchmark', confidence: 5, domain: 'general' }))
    store.save()

    const result = flyupReview(store, { batch: true })

    expect(result.items.map(i => i.id)).toEqual(expect.arrayContaining(['FRAG-001', 'FRAG-002', 'FRAG-003']))
    expect(result.items.find(i => i.id === 'FRAG-001')!.reasons).toContain('low-context engineering fragment')
    expect(result.items.map(i => i.id)).not.toContain('NORMAL-PORT')
  })

  it('prune is dry-run by default and does not mutate YAML', () => {
    store.addEngram(makeEngram({ id: 'DOGFOOD-002', statement: 'hermes-provider-v051-explain-boundary marker', tags: ['dogfood'] }))
    store.save()

    const result = flyupPrune(store, {})
    const fresh = new FlyupMemStore({ store_path: dir })
    fresh.load()

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(false)
    expect(result.matched).toBe(1)
    expect(result.changed).toBe(0)
    expect(fresh.getEngramById('DOGFOOD-002')!.status).toBe('active')
  })

  it('prune --apply retires matched memories and persists the change', () => {
    store.addEngram(makeEngram({ id: 'DOGFOOD-003', statement: 'cli-explain-20260501 marker', tags: ['dogfood'] }))
    store.save()

    const result = flyupPrune(store, { apply: true })
    const fresh = new FlyupMemStore({ store_path: dir })
    fresh.load()

    expect(result.applied).toBe(true)
    expect(result.matched).toBe(1)
    expect(result.changed).toBe(1)
    const retired = fresh.getEngramById('DOGFOOD-003')!
    expect(retired.status).toBe('retired')
    expect(retired.tags).toContain('pruned')
    expect(retired.temporal.valid_until).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('prune by explicit id does not retire locked memories', () => {
    store.addEngram(makeEngram({ id: 'LOCKED-001', statement: 'dogfood marker but locked', tags: ['dogfood'], status: 'locked' }))
    store.save()

    const result = flyupPrune(store, { apply: true, ids: ['LOCKED-001'] })
    const fresh = new FlyupMemStore({ store_path: dir })
    fresh.load()

    expect(result.matched).toBe(1)
    expect(result.changed).toBe(0)
    expect(result.skipped[0].reason).toContain('locked')
    expect(fresh.getEngramById('LOCKED-001')!.status).toBe('locked')
  })

  // ─── Batch operations ─────────────────────────────────────────

  it('review --batch removes the default 50-item limit', () => {
    // Add 60 dogfood memories
    for (let i = 0; i < 60; i++) {
      store.addEngram(makeEngram({ id: `BATCH-${i}`, statement: `dogfood marker ${i}`, tags: ['dogfood'] }))
    }
    store.save()

    const limited = flyupReview(store)
    const batched = flyupReview(store, { batch: true })

    expect(limited.total).toBe(50) // default limit
    expect(batched.total).toBe(60) // no limit
  })

  it('prune --all retires all review candidates in one pass', () => {
    store.addEngram(makeEngram({ id: 'ALL-001', statement: 'dogfood marker A', tags: ['dogfood'] }))
    store.addEngram(makeEngram({ id: 'ALL-002', statement: 'dogfood marker B', tags: ['test'] }))
    store.addEngram(makeEngram({ id: 'ALL-003', statement: '主人偏好直接给结论。' })) // not a candidate
    store.save()

    const result = flyupPrune(store, { all: true })
    const fresh = new FlyupMemStore({ store_path: dir })
    fresh.load()

    expect(result.applied).toBe(true)
    expect(result.matched).toBe(2)
    expect(result.changed).toBe(2)
    expect(fresh.getEngramById('ALL-001')!.status).toBe('retired')
    expect(fresh.getEngramById('ALL-002')!.status).toBe('retired')
    expect(fresh.getEngramById('ALL-003')!.status).toBe('active') // untouched
  })

  it('prune --confirm returns per-item detail output', () => {
    store.addEngram(makeEngram({ id: 'CFM-001', statement: 'dogfood marker X', tags: ['dogfood'] }))
    store.addEngram(makeEngram({ id: 'CFM-LOCKED', statement: 'dogfood locked', tags: ['dogfood'], status: 'locked' }))
    store.save()

    const result = flyupPrune(store, { confirm: true })

    expect(result.applied).toBe(true)
    expect(result.confirm_details).toBeDefined()
    expect(result.confirm_details!.length).toBe(2)

    const retired = result.confirm_details!.find(d => d.id === 'CFM-001')!
    expect(retired.action).toBe('retired')
    expect(retired.reason).toContain('dogfood/test tag')

    const skipped = result.confirm_details!.find(d => d.id === 'CFM-LOCKED')!
    expect(skipped.action).toBe('skipped')
    expect(skipped.reason).toContain('locked')
  })
})
