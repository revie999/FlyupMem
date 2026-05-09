import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import type { Experience } from '../src/core/types.js'

function makeExperience(id: string, statement: string, sourceMemoryIds: string[] = ['ENG-TEST-001']): Experience {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  return {
    id,
    layer: 'experience',
    status: 'active',
    scope: 'test',
    domain: 'testing',
    tags: ['experience', 'test'],
    title: statement.slice(0, 48),
    statement,
    source_memory_ids: sourceMemoryIds,
    evidence_summary: `Evidence for ${statement}`,
    pattern_type: 'workflow',
    occurrence_count: Math.max(1, sourceMemoryIds.length),
    first_seen: now,
    last_seen: now,
    confidence: 8,
    trend: 'new',
    activation: {
      retrieval_strength: 0.8,
      storage_strength: 1.0,
      frequency: 1,
      turn_count: 1,
      last_accessed: today,
    },
    emotional_weight: 5,
    entities: [{ name: 'FlyupMem', type: 'project' }],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    history: [{ event: 'created', at: now, from: sourceMemoryIds }],
  }
}

describe('Experience store support', () => {
  let storeDir: string

  beforeEach(() => {
    storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-experience-'))
  })

  afterEach(() => {
    fs.rmSync(storeDir, { recursive: true, force: true })
  })

  it('persists and reloads experiences.yaml', () => {
    const store = new FlyupMemStore({ store_path: storeDir })
    store.load()

    const exp = makeExperience('EXP-TEST-001', 'Repeated debugging benefits from evidence-first diagnosis')
    store.addExperience(exp)
    store.save()

    expect(fs.existsSync(path.join(storeDir, 'experiences.yaml'))).toBe(true)

    const reloaded = new FlyupMemStore({ store_path: storeDir })
    reloaded.load()

    expect(reloaded.experiences).toHaveLength(1)
    expect(reloaded.experiences[0].id).toBe('EXP-TEST-001')
    expect(reloaded.experiences[0].statement).toContain('evidence-first')
  })

  it('includes experiences in allMemories and getById', () => {
    const store = new FlyupMemStore({ store_path: storeDir })
    store.load()

    const exp = makeExperience('EXP-TEST-002', 'Async writes should drain before process exit')
    store.addExperience(exp)

    expect(store.allMemories().map(m => m.id)).toContain('EXP-TEST-002')
    expect(store.getById('EXP-TEST-002')?.layer).toBe('experience')
  })

  it('updates and removes experiences', () => {
    const store = new FlyupMemStore({ store_path: storeDir })
    store.load()

    store.addExperience(makeExperience('EXP-TEST-003', 'Initial experience statement'))
    store.updateExperience('EXP-TEST-003', {
      statement: 'Updated experience statement',
      confidence: 9,
      trend: 'strengthening',
    })

    expect(store.experiences[0].statement).toBe('Updated experience statement')
    expect(store.experiences[0].confidence).toBe(9)
    expect(store.experiences[0].trend).toBe('strengthening')

    store.removeExperience('EXP-TEST-003')
    expect(store.experiences).toHaveLength(0)
  })

  it('merges concurrent experience writes from two store instances', () => {
    const storeA = new FlyupMemStore({ store_path: storeDir })
    const storeB = new FlyupMemStore({ store_path: storeDir })
    storeA.load()
    storeB.load()

    storeA.addExperience(makeExperience('EXP-TEST-A', 'Experience from store A'))
    storeA.save()

    storeB.addExperience(makeExperience('EXP-TEST-B', 'Experience from store B'))
    storeB.save()

    const reloaded = new FlyupMemStore({ store_path: storeDir })
    reloaded.load()

    expect(reloaded.experiences.map(e => e.id).sort()).toEqual(['EXP-TEST-A', 'EXP-TEST-B'])
  })

  it('reports experience count in stats', () => {
    const store = new FlyupMemStore({ store_path: storeDir })
    store.load()

    store.addExperience(makeExperience('EXP-TEST-004', 'Stats include experience count'))
    expect(store.stats().experiences).toBe(1)
  })
})
