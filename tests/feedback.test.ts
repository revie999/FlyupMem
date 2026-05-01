// tests/feedback.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import { flyupLearn } from '../src/tools/flyup_learn.js'
import { applyFeedback, getFeedbackSummary } from '../src/lifecycle/feedback.js'
import { contentHash } from '../src/core/hash.js'
import { generateId } from '../src/core/id.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-feedback-'))
}

function makeEngram(overrides: any = {}): any {
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
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 1, last_accessed: today },
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

describe('applyFeedback', () => {
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

  it('applies positive feedback and boosts activation', () => {
    // Use lower initial storage_strength so the boost is measurable
    store.addEngram({
      ...makeEngram(),
      id: 'ENG-FB-001',
      statement: '记住：端口是 7897',
      content_hash: contentHash('记住：端口是 7897'),
      activation: { retrieval_strength: 0.5, storage_strength: 0.5, frequency: 1, last_accessed: new Date().toISOString().slice(0, 10) },
    } as any)
    store.save()
    const memId = 'ENG-FB-001'

    const before = store.getEngramById(memId)!
    const beforeRS = before.activation.retrieval_strength
    const beforeSS = before.activation.storage_strength
    const beforeConf = before.confidence

    applyFeedback(memId, 'positive', store)

    const after = store.getEngramById(memId)!
    expect(after.activation.retrieval_strength).toBeGreaterThan(beforeRS)
    expect(after.activation.storage_strength).toBeGreaterThan(beforeSS)
    expect(after.confidence).toBeGreaterThan(beforeConf)
  })

  it('applies negative feedback and reduces activation', () => {
    const result = flyupLearn('以后都用 Jest', '好的', store)
    const memId = result.engramIds[0]

    const before = store.getEngramById(memId)!
    const beforeRS = before.activation.retrieval_strength

    applyFeedback(memId, 'negative', store)

    const after = store.getEngramById(memId)!
    expect(after.activation.retrieval_strength).toBeLessThan(beforeRS)
  })

  it('auto-retires after 3 consecutive negatives', () => {
    const result = flyupLearn('不要用 TypeScript', '好的', store)
    const memId = result.engramIds[0]

    // Apply 3 negative feedbacks
    const r1 = applyFeedback(memId, 'negative', store)
    expect(r1.retired).toBe(false)

    const r2 = applyFeedback(memId, 'negative', store)
    expect(r2.retired).toBe(false)

    const r3 = applyFeedback(memId, 'negative', store)
    expect(r3.retired).toBe(true)

    const mem = store.getEngramById(memId)!
    expect(mem.status).toBe('retired')
  })

  it('records feedback entry', () => {
    const result = flyupLearn('记住：Vitest 用 toMatchObject', '好的', store)
    const memId = result.engramIds[0]

    applyFeedback(memId, 'positive', store, '用户确认有用')

    const summary = getFeedbackSummary(memId, store)
    expect(summary).not.toBeNull()
    expect(summary!.totalFeedback).toBe(1)
    expect(summary!.recentFeedback[0].signal).toBe('positive')
    expect(summary!.recentFeedback[0].context).toBe('用户确认有用')
  })
})
