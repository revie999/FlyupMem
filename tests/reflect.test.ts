// tests/reflect.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { reflect } from '../src/enhance/reflect.js'
import { FlyupMemStore } from '../src/core/store.js'
import type { LLMClient } from '../src/enhance/llm-client.js'
import type { Observation } from '../src/core/types.js'
import { generateId } from '../src/core/id.js'
import { contentHash } from '../src/core/hash.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-reflect-'))
}

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  return {
    id: generateId('observation'),
    layer: 'observation',
    status: 'active',
    scope: 'global',
    domain: 'test',
    tags: [],
    title: 'Test observation',
    statement: 'Test observation fact about user preferences',
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
    entities: [],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    history: [{ event: 'created', at: now, from: [] }],
    ...overrides,
  }
}

function mockLLM(response: string): LLMClient {
  return {
    complete: async () => response,
    chat: async () => ({ content: response }),
  } as unknown as LLMClient
}

describe('reflect', () => {
  let dir: string
  let store: FlyupMemStore

  beforeEach(() => {
    dir = tmpDir()
    store = new FlyupMemStore({ store_path: dir })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when fewer than 2 observations', async () => {
    store.addObservation(makeObservation({ id: 'OBS-1' }))
    store.save()

    const llm = mockLLM('should not be called')
    const result = await reflect('test query', store, llm)
    expect(result).toBeNull()
  })

  it('returns null when no observations exist', async () => {
    const llm = mockLLM('should not be called')
    const result = await reflect('test query', store, llm)
    expect(result).toBeNull()
  })

  it('synthesizes a MentalModel from observations', async () => {
    store.addObservation(makeObservation({
      id: 'OBS-1',
      title: 'Prefers concise replies',
      statement: 'User consistently prefers short direct concise answers',
      proof_count: 3,
      confidence: 8,
    }))
    store.addObservation(makeObservation({
      id: 'OBS-2',
      title: 'Dislikes verbose explanations',
      statement: 'User explicitly asks for less verbose explanation concise communication',
      proof_count: 2,
      confidence: 7,
    }))
    store.save()

    const llmResponse = JSON.stringify({
      title: 'Concise Communication Preference',
      statement: 'The user strongly prefers concise, direct communication over verbose explanations.',
      domain: 'communication',
      confidence: 8,
    })

    const result = await reflect('user prefers concise communication style', store, mockLLM(llmResponse))

    expect(result).not.toBeNull()
    expect(result!.layer).toBe('mental_model')
    expect(result!.status).toBe('active')
    expect(result!.title).toBe('Concise Communication Preference')
    expect(result!.statement).toContain('concise')
    expect(result!.domain).toBe('communication')
    expect(result!.confidence).toBe(8)
    expect(result!.source_observation_ids).toContain('OBS-1')
    expect(result!.source_observation_ids).toContain('OBS-2')
    expect(result!.proof_count).toBe(5) // 3 + 2
    expect(result!.trend).toBe('new')
    expect(result!.activation.retrieval_strength).toBe(0.9)
  })

  it('strips markdown fences from LLM response', async () => {
    store.addObservation(makeObservation({ id: 'OBS-1', title: 'Fact A', statement: 'Test observation fact A' }))
    store.addObservation(makeObservation({ id: 'OBS-2', title: 'Fact B', statement: 'Test observation fact B' }))
    store.save()

    const llmResponse = '```json\n{"title":"Test","statement":"Test statement","domain":"test","confidence":6}\n```'
    const result = await reflect('test observation fact', store, mockLLM(llmResponse))

    expect(result).not.toBeNull()
    expect(result!.title).toBe('Test')
  })

  it('returns null when LLM returns invalid JSON', async () => {
    store.addObservation(makeObservation({ id: 'OBS-1', statement: 'Test fact alpha' }))
    store.addObservation(makeObservation({ id: 'OBS-2', statement: 'Test fact beta' }))
    store.save()

    const result = await reflect('test fact', store, mockLLM('not valid json at all'))
    expect(result).toBeNull()
  })

  it('clamps confidence to max 10', async () => {
    store.addObservation(makeObservation({ id: 'OBS-1', statement: 'Test clamp alpha' }))
    store.addObservation(makeObservation({ id: 'OBS-2', statement: 'Test clamp beta' }))
    store.save()

    const llmResponse = JSON.stringify({
      title: 'Test',
      statement: 'Test',
      domain: 'test',
      confidence: 15, // over max
    })

    const result = await reflect('test clamp', store, mockLLM(llmResponse))
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe(10)
  })

  it('uses defaults when LLM omits fields', async () => {
    store.addObservation(makeObservation({ id: 'OBS-1', statement: 'Test defaults alpha' }))
    store.addObservation(makeObservation({ id: 'OBS-2', statement: 'Test defaults beta' }))
    store.save()

    const llmResponse = JSON.stringify({
      statement: 'Minimal response',
      // missing title, domain, confidence
    })

    const result = await reflect('test defaults', store, mockLLM(llmResponse))
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Synthesized Mental Model')
    expect(result!.domain).toBe('general')
    expect(result!.confidence).toBe(7)
  })

  it('saves MentalModel to store', async () => {
    store.addObservation(makeObservation({ id: 'OBS-1', statement: 'Test save alpha' }))
    store.addObservation(makeObservation({ id: 'OBS-2', statement: 'Test save beta' }))
    store.save()

    const llmResponse = JSON.stringify({
      title: 'Saved Model',
      statement: 'This should be saved',
      domain: 'test',
      confidence: 6,
    })

    await reflect('test save', store, mockLLM(llmResponse))

    // Reload store and verify
    const freshStore = new FlyupMemStore({ store_path: dir })
    freshStore.load()
    expect(freshStore.mentalModels).toHaveLength(1)
    expect(freshStore.mentalModels[0].title).toBe('Saved Model')
  })

  it('sets emotional_weight to 7 for synthesized models', async () => {
    store.addObservation(makeObservation({ id: 'OBS-1', statement: 'Test weight alpha' }))
    store.addObservation(makeObservation({ id: 'OBS-2', statement: 'Test weight beta' }))
    store.save()

    const llmResponse = JSON.stringify({
      title: 'Test',
      statement: 'Test',
      domain: 'test',
      confidence: 5,
    })

    const result = await reflect('test weight', store, mockLLM(llmResponse))
    expect(result!.emotional_weight).toBe(7)
  })
})
