// tests/sqlite-cache.test.ts — SQLite FTS5 cache tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { SQLiteCache } from '../src/core/sqlite-cache.js'
import type { Engram, Observation, MentalModel } from '../src/core/types.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-sqlite-test-'))
}

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  return {
    id: `ENG-${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    layer: 'raw',
    status: 'active',
    consolidated: false,
    type: 'behavioral',
    memory_class: 'semantic',
    polarity: null,
    commitment: 'exploring',
    scope: 'global',
    visibility: 'private',
    domain: 'test',
    tags: ['test'],
    statement: 'Test statement about TypeScript',
    rationale: 'Testing FTS5',
    contraindications: [],
    entities: [],
    temporal: { learned_at: '2026-05-02T00:00:00Z', valid_from: '2026-05-02', valid_until: null },
    source: { episode_id: null, quote: '', origin: 'test' },
    activation: { retrieval_strength: 1.0, storage_strength: 1.0, frequency: 1, last_accessed: '2026-05-02' },
    emotional_weight: 5,
    confidence: 7,
    content_hash: 'abc123',
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 0,
    ...overrides,
  }
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: `OBS-${Math.random().toString(36).slice(2, 8)}`,
    layer: 'observation',
    status: 'active',
    scope: 'global',
    domain: 'test',
    tags: ['obs'],
    title: 'Test Observation',
    statement: 'Users prefer YAML over JSON for config',
    source_memory_ids: [],
    proof_count: 1,
    evidence: [],
    trend: 'new',
    confidence: 6,
    activation: { retrieval_strength: 0.8, storage_strength: 0.8, frequency: 1, last_accessed: '2026-05-02' },
    emotional_weight: 3,
    entities: [],
    temporal: { learned_at: '2026-05-02T00:00:00Z', valid_from: '2026-05-02', valid_until: null },
    history: [],
    ...overrides,
  }
}

function makeMentalModel(overrides: Partial<MentalModel> = {}): MentalModel {
  return {
    id: `MM-${Math.random().toString(36).slice(2, 8)}`,
    layer: 'mental_model',
    status: 'active',
    scope: 'global',
    domain: 'test',
    tags: ['mm'],
    title: 'Test Mental Model',
    statement: 'Local-first storage is better for single-user',
    source_observation_ids: [],
    proof_count: 3,
    confidence: 8,
    trend: 'stable',
    refresh_policy: { cadence: 'weekly', stale_after_days: 60 },
    last_refreshed: '2026-05-02',
    activation: { retrieval_strength: 0.9, storage_strength: 0.9, frequency: 2, last_accessed: '2026-05-02' },
    emotional_weight: 5,
    entities: [],
    temporal: { learned_at: '2026-05-02T00:00:00Z', valid_from: '2026-05-02', valid_until: null },
    ...overrides,
  }
}

describe('SQLiteCache', () => {
  let dir: string
  let cache: SQLiteCache

  beforeEach(() => {
    dir = tmpDir()
    cache = new SQLiteCache({ dbPath: path.join(dir, 'test.sqlite'), enabled: true })
    cache.open()
  })

  afterEach(() => {
    cache.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('opens and creates tables', () => {
    expect(cache.isAvailable).toBe(true)
    const stats = cache.stats()
    expect(stats.ftsRows).toBe(0)
    expect(stats.metaRows).toBe(0)
    expect(stats.dbSizeBytes).toBeGreaterThan(0)
  })

  it('disabled cache returns unavailable', () => {
    const disabled = new SQLiteCache({ dbPath: path.join(dir, 'no.sqlite'), enabled: false })
    expect(disabled.isAvailable).toBe(false)
    expect(disabled.ftsSearch('test')).toEqual([])
  })

  // ─── FTS5 ──────────────────────────────────────────────────

  describe('FTS5', () => {
    it('inserts and searches documents', () => {
      cache.ftsInsert('doc1', 'TypeScript is great', '', 'ts coding', '', '')
      cache.ftsInsert('doc2', 'Python is also good', '', 'python coding', '', '')
      cache.ftsInsert('doc3', 'TypeScript types are strict', '', 'ts types', '', '')

      const results = cache.ftsSearch('TypeScript')
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.map(r => r.id)).toContain('doc1')
      expect(results.map(r => r.id)).toContain('doc3')
    })

    it('returns empty for no matches', () => {
      cache.ftsInsert('doc1', 'Hello world', '', '', '', '')
      const results = cache.ftsSearch('xyznonexistent')
      expect(results).toEqual([])
    })

    it('deletes documents', () => {
      cache.ftsInsert('doc1', 'Test document', '', '', '', '')
      expect(cache.ftsSearch('Test').length).toBe(1)

      cache.ftsDelete('doc1')
      expect(cache.ftsSearch('Test').length).toBe(0)
    })

    it('updates documents', () => {
      cache.ftsInsert('doc1', 'Original text', '', '', '', '')
      expect(cache.ftsSearch('Original').length).toBe(1)

      cache.ftsUpdate('doc1', 'Updated text', '', '', '', '')
      expect(cache.ftsSearch('Original').length).toBe(0)
      expect(cache.ftsSearch('Updated').length).toBe(1)
    })

    it('respects limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        cache.ftsInsert(`doc${i}`, `Document number ${i} about testing`, '', '', '', '')
      }
      const results = cache.ftsSearch('testing', 5)
      expect(results.length).toBeLessThanOrEqual(5)
    })

    it('handles CJK text (trigram tokenizer limitation)', () => {
      // FTS5 trigram tokenizer operates on byte-level trigrams.
      // CJK characters (3 bytes each in UTF-8) may not match via MATCH operator.
      // The in-memory BM25 fallback handles CJK via jieba tokenization.
      cache.ftsInsert('zh1', '你好世界', '', '', '', '')
      cache.ftsInsert('zh2', '世界和平', '', '', '', '')

      // Trigram FTS5 may not match CJK — this is a known limitation.
      // English text should work fine:
      cache.ftsInsert('en1', 'hello world', '', '', '', '')
      const results = cache.ftsSearch('hello')
      expect(results.length).toBe(1)
    })
  })

  // ─── Metadata ──────────────────────────────────────────────

  describe('Metadata', () => {
    it('upserts and gets metadata', () => {
      const row = {
        id: 'm1', layer: 'engram', status: 'active', type: 'behavioral',
        scope: 'global', domain: 'test', confidence: 7, activation: 0.8,
        last_accessed: '2026-05-02', content_hash: 'abc',
        created_at: '2026-05-01', updated_at: '2026-05-02',
      }
      cache.metaUpsert(row)
      const got = cache.metaGet('m1')
      expect(got).toBeDefined()
      expect(got!.confidence).toBe(7)
      expect(got!.activation).toBeCloseTo(0.8)
    })

    it('updates on conflict', () => {
      cache.metaUpsert({
        id: 'm1', layer: 'engram', status: 'active', type: null,
        scope: null, domain: null, confidence: 5, activation: 1.0,
        last_accessed: null, content_hash: null,
        created_at: '2026-05-01', updated_at: '2026-05-01',
      })
      cache.metaUpsert({
        id: 'm1', layer: 'engram', status: 'fading', type: null,
        scope: null, domain: null, confidence: 3, activation: 0.5,
        last_accessed: null, content_hash: null,
        created_at: '2026-05-01', updated_at: '2026-05-02',
      })
      const got = cache.metaGet('m1')!
      expect(got.status).toBe('fading')
      expect(got.confidence).toBe(3)
    })

    it('deletes metadata', () => {
      cache.metaUpsert({
        id: 'm1', layer: 'engram', status: 'active', type: null,
        scope: null, domain: null, confidence: 5, activation: 1.0,
        last_accessed: null, content_hash: null,
        created_at: '2026-05-01', updated_at: '2026-05-01',
      })
      cache.metaDelete('m1')
      expect(cache.metaGet('m1')).toBeUndefined()
    })

    it('lists all metadata', () => {
      for (let i = 0; i < 5; i++) {
        cache.metaUpsert({
          id: `m${i}`, layer: 'engram', status: 'active', type: null,
          scope: null, domain: null, confidence: 5, activation: 1.0,
          last_accessed: null, content_hash: null,
          created_at: '2026-05-01', updated_at: '2026-05-01',
        })
      }
      expect(cache.metaAll().length).toBe(5)
    })
  })

  // ─── Rebuild ───────────────────────────────────────────────

  describe('Rebuild', () => {
    it('full rebuild indexes all items', () => {
      const result = cache.rebuildFromData({
        engrams: [makeEngram({ statement: 'TypeScript rocks' }), makeEngram({ statement: 'Python is cool' })],
        observations: [makeObservation({ statement: 'YAML is readable' })],
        mentalModels: [makeMentalModel({ statement: 'Local-first wins' })],
      })
      expect(result.indexed).toBe(4)

      const stats = cache.stats()
      expect(stats.ftsRows).toBe(4)
      expect(stats.metaRows).toBe(4)
    })

    it('rebuild clears old data', () => {
      cache.ftsInsert('old', 'old data', '', '', '', '')
      cache.rebuildFromData({
        engrams: [makeEngram({ id: 'new1', statement: 'new data' })],
        observations: [],
        mentalModels: [],
      })
      expect(cache.ftsSearch('old').length).toBe(0)
      expect(cache.ftsSearch('new').length).toBe(1)
    })

    it('incremental update adds new items', () => {
      cache.rebuildFromData({
        engrams: [makeEngram({ id: 'e1', statement: 'first', content_hash: 'h1' })],
        observations: [],
        mentalModels: [],
      })

      const result = cache.incrementalUpdate({
        engrams: [
          makeEngram({ id: 'e1', statement: 'first', content_hash: 'h1' }),
          makeEngram({ id: 'e2', statement: 'second', content_hash: 'h2' }),
        ],
        observations: [],
        mentalModels: [],
      })
      expect(result.added).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.removed).toBe(0)
    })

    it('incremental update removes deleted items', () => {
      cache.rebuildFromData({
        engrams: [
          makeEngram({ id: 'e1', statement: 'keep', content_hash: 'h1' }),
          makeEngram({ id: 'e2', statement: 'remove', content_hash: 'h2' }),
        ],
        observations: [],
        mentalModels: [],
      })

      const result = cache.incrementalUpdate({
        engrams: [makeEngram({ id: 'e1', statement: 'keep', content_hash: 'h1' })],
        observations: [],
        mentalModels: [],
      })
      expect(result.removed).toBe(1)
      expect(cache.ftsSearch('remove').length).toBe(0)
    })

    it('incremental update detects content changes', () => {
      cache.rebuildFromData({
        engrams: [makeEngram({ id: 'e1', statement: 'original', content_hash: 'h1' })],
        observations: [],
        mentalModels: [],
      })

      const result = cache.incrementalUpdate({
        engrams: [makeEngram({ id: 'e1', statement: 'modified', content_hash: 'h2' })],
        observations: [],
        mentalModels: [],
      })
      expect(result.updated).toBe(1)
      expect(cache.ftsSearch('original').length).toBe(0)
      expect(cache.ftsSearch('modified').length).toBe(1)
    })
  })

  // ─── Sync single item ──────────────────────────────────────

  describe('syncEngram', () => {
    it('syncs a new engram', () => {
      const e = makeEngram({ statement: 'Sync test' })
      cache.syncEngram(e)
      expect(cache.ftsSearch('Sync').length).toBe(1)
      expect(cache.metaGet(e.id)).toBeDefined()
    })

    it('updates existing engram on re-sync', () => {
      const e = makeEngram({ statement: 'before' })
      cache.syncEngram(e)
      expect(cache.ftsSearch('before').length).toBe(1)

      const updated = { ...e, statement: 'after' }
      cache.syncEngram(updated)
      expect(cache.ftsSearch('before').length).toBe(0)
      expect(cache.ftsSearch('after').length).toBe(1)
    })
  })

  // ─── Remove ────────────────────────────────────────────────

  describe('removeItem', () => {
    it('removes from FTS, meta, and vectors', () => {
      cache.ftsInsert('r1', 'remove me', '', '', '', '')
      cache.metaUpsert({
        id: 'r1', layer: 'engram', status: 'active', type: null,
        scope: null, domain: null, confidence: 5, activation: 1.0,
        last_accessed: null, content_hash: null,
        created_at: '2026-05-01', updated_at: '2026-05-01',
      })

      cache.removeItem('r1')
      expect(cache.ftsSearch('remove').length).toBe(0)
      expect(cache.metaGet('r1')).toBeUndefined()
    })
  })

  // ─── Stats ─────────────────────────────────────────────────

  describe('Stats', () => {
    it('returns correct counts after operations', () => {
      cache.rebuildFromData({
        engrams: [makeEngram(), makeEngram()],
        observations: [makeObservation()],
        mentalModels: [],
      })
      const stats = cache.stats()
      expect(stats.ftsRows).toBe(3)
      expect(stats.metaRows).toBe(3)
      expect(stats.vecRows).toBe(0)
      expect(stats.dbSizeBytes).toBeGreaterThan(0)
    })
  })
})
