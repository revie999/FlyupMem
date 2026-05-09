import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import type { Observation, MentalModel } from '../src/core/types.js'
import { generateId } from '../src/core/id.js'
import { createExperienceFromMemories, induceExperiences } from '../src/lifecycle/experience.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-experience-induction-'))
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  return {
    id: generateId('observation'),
    layer: 'observation',
    status: 'active',
    scope: 'global',
    domain: 'debugging',
    tags: ['debugging', 'workflow'],
    title: 'Evidence-first debugging',
    statement: 'Debugging should start by collecting evidence before changing code',
    source_memory_ids: [],
    proof_count: 2,
    evidence: [],
    trend: 'stable',
    confidence: 7,
    activation: {
      retrieval_strength: 0.8,
      storage_strength: 1.0,
      frequency: 3,
      turn_count: 2,
      last_accessed: today,
    },
    emotional_weight: 5,
    entities: [{ name: 'debugging', type: 'concept' }],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    history: [{ event: 'created', at: now, from: [] }],
    ...overrides,
  }
}

function makeMentalModel(overrides: Partial<MentalModel> = {}): MentalModel {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  return {
    id: generateId('mental_model'),
    layer: 'mental_model',
    status: 'active',
    scope: 'global',
    domain: 'debugging',
    tags: ['debugging', 'workflow'],
    title: 'Evidence-first debugging model',
    statement: 'Prefer evidence-first diagnosis over speculative code edits',
    source_observation_ids: [],
    proof_count: 3,
    confidence: 8,
    trend: 'stable',
    refresh_policy: { cadence: 'weekly', stale_after_days: 60 },
    last_refreshed: now,
    activation: {
      retrieval_strength: 0.9,
      storage_strength: 1.0,
      frequency: 2,
      turn_count: 1,
      last_accessed: today,
    },
    emotional_weight: 6,
    entities: [{ name: 'debugging', type: 'concept' }],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    ...overrides,
  }
}

describe('Experience induction', () => {
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

  it('creates a valid Experience from repeated observations', () => {
    const memories = [
      makeObservation({ id: 'OBS-EXP-001', statement: 'Debugging should begin with logs and evidence' }),
      makeObservation({ id: 'OBS-EXP-002', statement: 'Collect evidence before changing code during debugging' }),
      makeObservation({ id: 'OBS-EXP-003', statement: 'Evidence-first diagnosis avoids speculative fixes' }),
    ]

    const exp = createExperienceFromMemories(memories, [])

    expect(exp.id).toMatch(/^EXP-/)
    expect(exp.layer).toBe('experience')
    expect(exp.source_memory_ids).toEqual(['OBS-EXP-001', 'OBS-EXP-002', 'OBS-EXP-003'])
    expect(exp.pattern_type).toBe('workflow')
    expect(exp.occurrence_count).toBeGreaterThanOrEqual(3)
    expect(exp.evidence_summary).toContain('Evidence-first')
  })

  it('induces and persists experiences from repeated patterns', () => {
    store.addObservation(makeObservation({ id: 'OBS-EXP-101', statement: 'Debugging workflow starts with logs' }))
    store.addObservation(makeObservation({ id: 'OBS-EXP-102', statement: 'Debugging workflow requires evidence collection' }))
    store.addObservation(makeObservation({ id: 'OBS-EXP-103', statement: 'Debugging workflow avoids speculative edits' }))

    const result = induceExperiences(store, { minEvidence: 3, maxExperiences: 2, includeMentalModels: false })

    expect(result.created).toHaveLength(1)
    expect(store.experiences).toHaveLength(1)
    expect(store.experiences[0].source_memory_ids.sort()).toEqual(['OBS-EXP-101', 'OBS-EXP-102', 'OBS-EXP-103'])

    const reloaded = new FlyupMemStore({ store_path: dir })
    reloaded.load()
    expect(reloaded.experiences).toHaveLength(1)
  })

  it('does not create duplicate experiences for the same evidence set', () => {
    store.addObservation(makeObservation({ id: 'OBS-EXP-201', statement: 'Debugging workflow starts with logs' }))
    store.addObservation(makeObservation({ id: 'OBS-EXP-202', statement: 'Debugging workflow requires evidence collection' }))
    store.addObservation(makeObservation({ id: 'OBS-EXP-203', statement: 'Debugging workflow avoids speculative edits' }))

    const first = induceExperiences(store, { minEvidence: 3 })
    const second = induceExperiences(store, { minEvidence: 3 })

    expect(first.created).toHaveLength(1)
    expect(second.created).toHaveLength(0)
    expect(second.skipped).toBeGreaterThanOrEqual(1)
    expect(store.experiences).toHaveLength(1)
  })

  it('can include mental models as evidence', () => {
    store.addObservation(makeObservation({ id: 'OBS-EXP-301', statement: 'Debugging workflow starts with logs' }))
    store.addObservation(makeObservation({ id: 'OBS-EXP-302', statement: 'Debugging workflow requires evidence collection' }))
    store.addMentalModel(makeMentalModel({ id: 'MM-EXP-303', statement: 'Evidence-first diagnosis is preferred' }))

    const result = induceExperiences(store, { minEvidence: 3, includeMentalModels: true })

    expect(result.created).toHaveLength(1)
    expect(store.experiences[0].source_memory_ids.sort()).toEqual(['MM-EXP-303', 'OBS-EXP-301', 'OBS-EXP-302'])
  })

  it('does nothing when evidence is below threshold', () => {
    store.addObservation(makeObservation({ id: 'OBS-EXP-401' }))
    store.addObservation(makeObservation({ id: 'OBS-EXP-402' }))

    const result = induceExperiences(store, { minEvidence: 3 })

    expect(result.created).toHaveLength(0)
    expect(store.experiences).toHaveLength(0)
  })
})
