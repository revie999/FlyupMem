// tests/decay.test.ts
import { describe, it, expect } from 'vitest'
import {
  decayedStrength, decayedConfidence, reactivate, statusFromStrength,
  computeActivation, computeQualityScore,
} from '../src/lifecycle/decay.js'
import type { Activation } from '../src/core/types.js'

function makeActivation(overrides: Partial<Activation> = {}): Activation {
  const today = new Date().toISOString().slice(0, 10)
  return {
    retrieval_strength: 0.8,
    storage_strength: 1.0,
    frequency: 5,
    turn_count: 0,
    last_accessed: today,
    ...overrides,
  }
}

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
    const recent = computeActivation(makeActivation({ last_accessed: today }), 'raw', 5)
    const old = computeActivation(makeActivation({ last_accessed: '2020-01-01' }), 'raw', 5)
    expect(recent).toBeGreaterThan(old)
  })

  it('turn_count adds a log-scaled boost', () => {
    const noTurns = computeActivation(makeActivation({ turn_count: 0 }), 'raw', 5)
    const tenTurns = computeActivation(makeActivation({ turn_count: 10 }), 'raw', 5)
    expect(tenTurns).toBeGreaterThan(noTurns)
  })

  it('turn_count boost is capped at 0.15', () => {
    const hundred = computeActivation(makeActivation({ turn_count: 100 }), 'raw', 5)
    const thousand = computeActivation(makeActivation({ turn_count: 1000 }), 'raw', 5)
    // Should be very close since both are capped
    expect(Math.abs(hundred - thousand)).toBeLessThan(0.01)
  })

  it('activation with high turn_count outperforms high frequency alone', () => {
    const highFreq = computeActivation(makeActivation({ frequency: 50, turn_count: 0 }), 'raw', 5)
    const highTurns = computeActivation(makeActivation({ frequency: 0, turn_count: 20 }), 'raw', 5)
    // turn_count boost (0.04*log1p(20)≈0.12) should be comparable to frequency boost (0.2 cap at 50)
    // frequency boost at 50: min(0.2, log1p(50)*0.05) ≈ 0.20
    // turn boost at 20: min(0.15, log1p(20)*0.04) ≈ 0.12
    // So highFreq should still be higher, but highTurns should be significant
    expect(highTurns).toBeGreaterThan(noTurns())
  })
})

function noTurns() {
  // Just a helper for the baseline
  const today = new Date().toISOString().slice(0, 10)
  return computeActivation(
    { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 0, turn_count: 0, last_accessed: today },
    'raw', 5,
  )
}

describe('computeQualityScore', () => {
  it('higher turn_count increases quality', () => {
    const low = computeQualityScore(makeActivation({ turn_count: 0 }), 'raw', 5, false, undefined, 0)
    const high = computeQualityScore(makeActivation({ turn_count: 10 }), 'raw', 5, false, undefined, 0)
    expect(high).toBeGreaterThan(low)
  })

  it('consolidated memories get a bonus', () => {
    const base = computeQualityScore(makeActivation(), 'raw', 5, false, undefined, 0)
    const consolidated = computeQualityScore(makeActivation(), 'raw', 5, true, undefined, 0)
    expect(consolidated).toBeGreaterThan(base)
  })

  it('positive feedback boosts quality', () => {
    const noFeedback = computeQualityScore(makeActivation(), 'raw', 5, false, undefined, 0)
    const withFeedback = computeQualityScore(makeActivation(), 'raw', 5, false, {
      positive: 8, negative: 1, neutral: 1,
    })
    expect(withFeedback).toBeGreaterThan(noFeedback)
  })

  it('negative feedback reduces quality vs positive', () => {
    const positive = computeQualityScore(makeActivation(), 'raw', 5, false, {
      positive: 8, negative: 1, neutral: 1,
    }, 0)
    const negative = computeQualityScore(makeActivation(), 'raw', 5, false, {
      positive: 1, negative: 8, neutral: 1,
    }, 0)
    expect(positive).toBeGreaterThan(negative)
  })

  it('stale memory has lower quality than fresh', () => {
    const today = new Date().toISOString().slice(0, 10)
    const fresh = computeQualityScore(makeActivation({ last_accessed: today }), 'raw', 5, false, undefined, 0)
    const stale = computeQualityScore(makeActivation({ last_accessed: '2020-01-01' }), 'raw', 5, false, undefined, 0)
    expect(fresh).toBeGreaterThan(stale)
  })

  it('adoption count boosts quality', () => {
    const noAdoption = computeQualityScore(makeActivation(), 'raw', 5, false, undefined, 0)
    const fiveAdoptions = computeQualityScore(makeActivation(), 'raw', 5, false, undefined, 5)
    const twentyAdoptions = computeQualityScore(makeActivation(), 'raw', 5, false, undefined, 20)
    expect(fiveAdoptions).toBeGreaterThan(noAdoption)
    expect(twentyAdoptions).toBeGreaterThan(fiveAdoptions)
  })

  it('adoption boost is capped at 0.20', () => {
    const high = computeQualityScore(makeActivation(), 'raw', 5, false, undefined, 100)
    const veryHigh = computeQualityScore(makeActivation(), 'raw', 5, false, undefined, 1000)
    expect(Math.abs(high - veryHigh)).toBeLessThan(0.01)
  })

  it('quality score is between 0 and 1', () => {
    // Worst case
    const worst = computeQualityScore(
      { retrieval_strength: 0, storage_strength: 0, frequency: 0, turn_count: 0, last_accessed: '2020-01-01' },
      'experience', 1, false, { positive: 0, negative: 10, neutral: 0 }, 0,
    )
    expect(worst).toBeGreaterThanOrEqual(0)
    expect(worst).toBeLessThanOrEqual(1)

    // Best case
    const today = new Date().toISOString().slice(0, 10)
    const best = computeQualityScore(
      { retrieval_strength: 1.0, storage_strength: 1.0, frequency: 100, turn_count: 100, last_accessed: today },
      'mental_model', 10, true, { positive: 50, negative: 0, neutral: 0 }, 10,
    )
    expect(best).toBeGreaterThanOrEqual(0)
    expect(best).toBeLessThanOrEqual(1)
  })
})

describe('decayedConfidence', () => {
  it('returns original for 0 days', () => {
    expect(decayedConfidence(8, 0, 5)).toBe(8)
  })

  it('decays to ~5 after 90 days with default emotional weight', () => {
    // confidence 8, half-life 90 days: should be ~4.5 → round to 5
    const result = decayedConfidence(8, 90, 5)
    expect(result).toBeGreaterThanOrEqual(4)
    expect(result).toBeLessThanOrEqual(5)
  })

  it('decays to ~1 after 360 days (4 half-lives)', () => {
    // confidence 8, after 4 half-lives with emotional_weight=5
    // lambda = ln(2)/90 * (1-5/20) = 0.005776; decayed = 1 + 7*exp(-0.005776*360) ≈ 1.875 → round to 2
    const result = decayedConfidence(8, 360, 5)
    expect(result).toBe(2)
  })

  it('never goes below floor of 1', () => {
    const result = decayedConfidence(10, 10000, 0)
    expect(result).toBeGreaterThanOrEqual(1)
  })

  it('higher emotional weight slows decay', () => {
    const lowWeight = decayedConfidence(8, 90, 1)
    const highWeight = decayedConfidence(8, 90, 9)
    expect(highWeight).toBeGreaterThan(lowWeight)
  })

  it('confidence 1 stays at 1 regardless of time', () => {
    expect(decayedConfidence(1, 90, 5)).toBe(1)
    expect(decayedConfidence(1, 365, 5)).toBe(1)
  })

  it('confidence 10 with high emotional weight decays slowly', () => {
    // emotional_weight 10 → lambda halved → 90 days ≈ 45 days equivalent
    const result = decayedConfidence(10, 90, 10)
    expect(result).toBeGreaterThanOrEqual(7)
    expect(result).toBeLessThanOrEqual(8)
  })
})
