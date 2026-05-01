// tests/decay.test.ts
import { describe, it, expect } from 'vitest'
import { decayedStrength, reactivate, statusFromStrength, computeActivation } from '../src/lifecycle/decay.js'

describe('decayedStrength', () => {
  it('returns near-original for 0 days', () => {
    const s = decayedStrength(1.0, 0, 'raw', 5)
    expect(s).toBeCloseTo(1.0, 1)
  })

  it('decays faster for Experience (L4) than Mental Model (L1)', () => {
    const after30 = (layer: 'mental_model' | 'experience') =>
      decayedStrength(1.0, 30, layer, 5)

    const mm = after30('mental_model')
    const exp = after30('experience')
    expect(mm).toBeGreaterThan(exp)
  })

  it('higher emotional_weight slows decay', () => {
    const low = decayedStrength(1.0, 30, 'raw', 1)
    const high = decayedStrength(1.0, 30, 'raw', 9)
    expect(high).toBeGreaterThan(low)
  })

  it('never goes below floor', () => {
    const s = decayedStrength(1.0, 10000, 'experience', 1)
    expect(s).toBeGreaterThanOrEqual(0.05)
  })
})

describe('reactivate', () => {
  it('boosts by 0.1', () => {
    expect(reactivate(0.5)).toBeCloseTo(0.6)
  })

  it('caps at 1.0', () => {
    expect(reactivate(0.95)).toBe(1.0)
  })
})

describe('statusFromStrength', () => {
  it('maps ranges to statuses', () => {
    expect(statusFromStrength(0.8)).toBe('active')
    expect(statusFromStrength(0.4)).toBe('fading')
    expect(statusFromStrength(0.15)).toBe('dormant')
    expect(statusFromStrength(0.05)).toBe('retired')
  })
})

describe('computeActivation', () => {
  it('returns higher for recently accessed', () => {
    const today = new Date().toISOString().slice(0, 10)
    const recent = computeActivation(
      { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 5, last_accessed: today },
      'raw',
      5,
    )
    const old = computeActivation(
      { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 5, last_accessed: '2020-01-01' },
      'raw',
      5,
    )
    expect(recent).toBeGreaterThan(old)
  })
})
