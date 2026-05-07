// src/lifecycle/decay.ts — ACT-R activation decay with layer-based λ

import type { Activation, Layer } from '../core/types.js'
import { LAYER_ORDER } from '../core/types.js'

// Layer-based decay rates
const DECAY_RATES: Record<number, number> = {
  1: 0.01,   // Mental Model — 极慢
  2: 0.025,  // Observation — 慢
  3: 0.05,   // Engram — 标准
  4: 0.08,   // Experience — 快
}

const FLOOR = 0.05  // 永不归零

/**
 * Compute decayed retrieval strength using ACT-R formula.
 * effective_lambda = base_lambda * (1 - emotional_weight / 20)
 */
export function decayedStrength(
  retrievalStrength: number,
  daysSinceAccess: number,
  layer: Layer,
  emotionalWeight: number = 5,
): number {
  const level = LAYER_ORDER[layer]
  const baseLambda = DECAY_RATES[level] ?? 0.05
  const effectiveLambda = baseLambda * (1 - emotionalWeight / 20)
  return FLOOR + (retrievalStrength - FLOOR) * Math.exp(-effectiveLambda * daysSinceAccess)
}

/**
 * Boost retrieval strength on access (+0.1, capped at 1.0).
 */
export function reactivate(current: number): number {
  return Math.min(1.0, current + 0.1)
}

/**
 * Map retrieval strength to status.
 */
export function statusFromStrength(strength: number): string {
  if (strength > 0.5) return 'active'
  if (strength > 0.3) return 'fading'
  if (strength > 0.1) return 'dormant'
  return 'retired'
}

/**
 * Compute current activation score (retrieval strength + frequency boost + turn count boost).
 */
export function computeActivation(
  activation: Activation,
  layer: Layer,
  emotionalWeight: number = 5,
): number {
  const now = Date.now()
  const lastAccess = new Date(activation.last_accessed).getTime()
  const daysSince = (now - lastAccess) / (1000 * 60 * 60 * 24)

  const rs = decayedStrength(activation.retrieval_strength, daysSince, layer, emotionalWeight)
  const freqBoost = Math.min(0.2, Math.log1p(activation.frequency) * 0.05)
  const turnBoost = Math.min(0.15, Math.log1p(activation.turn_count ?? 0) * 0.04)
  return Math.min(1.0, rs + freqBoost + turnBoost)
}

/**
 * Compute memory quality score.
 * Higher quality = more useful, more proven, more stable.
 *
 * Factors:
 * - turn_count: log-scaled, capped at 0.30 (proven usefulness)
 * - decay_ratio: current activation / max possible → penalizes stale memories
 * - consolidated: Observations get a promotion bonus (+0.15)
 * - feedback_balance: positive ratio boosts quality
 */
export function computeQualityScore(
  activation: Activation,
  layer: Layer,
  emotionalWeight: number = 5,
  consolidated: boolean = false,
  feedback?: { positive: number; negative: number; neutral: number },
  adoptionCount: number = 0,
): number {
  // Turn count contribution: proven usefulness
  const turnScore = Math.min(0.30, Math.log1p(activation.turn_count ?? 0) * 0.08)

  // Decay ratio: how "alive" is this memory
  const currentActivation = computeActivation(activation, layer, emotionalWeight)
  const decayRatio = Math.min(1.0, currentActivation)

  // Consolidation promotion
  const consolidationBonus = consolidated ? 0.15 : 0

  // Feedback balance: positive ratio → quality signal
  let feedbackScore = 0
  if (feedback) {
    const total = feedback.positive + feedback.negative + feedback.neutral
    if (total > 0) {
      const positiveRatio = feedback.positive / total
      feedbackScore = positiveRatio * 0.15 // max 0.15 (reduced to make room for adoption)
    }
  }

  // Adoption bonus: proven user adoption after recall
  const adoptionScore = Math.min(0.20, Math.log1p(adoptionCount) * 0.06)

  return Math.min(1.0, turnScore + decayRatio * 0.30 + consolidationBonus + feedbackScore + adoptionScore)
}

/**
 * Get days since ISO date string.
 */
export function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime()
  const now = Date.now()
  return Math.max(0, (now - then) / (1000 * 60 * 60 * 24))
}

// ─── Confidence Decay ────────────────────────────────────────

const CONFIDENCE_HALF_LIFE_DAYS = 90  // 每90天衰减一半
const CONFIDENCE_LAMBDA = Math.LN2 / CONFIDENCE_HALF_LIFE_DAYS  // ≈ 0.0077
const CONFIDENCE_FLOOR = 1

/**
 * Decay confidence over time using exponential decay (half-life = 90 days).
 *
 * Emotional weight modulates the effective decay rate:
 *   - emotional_weight 10 → decay rate halved (memories last 2x longer)
 *   - emotional_weight 5  → normal decay
 *   - emotional_weight 0  → decay rate boosted 1.25x (faster fade)
 *
 * @param currentConfidence  Current confidence value (1-10)
 * @param daysSinceAccess    Days since last access
 * @param emotionalWeight    Emotional weight (1-10), default 5
 * @returns Decayed confidence, rounded to integer, floored at 1
 */
export function decayedConfidence(
  currentConfidence: number,
  daysSinceAccess: number,
  emotionalWeight: number = 5,
): number {
  const effectiveLambda = CONFIDENCE_LAMBDA * (1 - emotionalWeight / 20)
  const decayed = CONFIDENCE_FLOOR + (currentConfidence - CONFIDENCE_FLOOR) * Math.exp(-effectiveLambda * daysSinceAccess)
  return Math.max(CONFIDENCE_FLOOR, Math.round(decayed))
}
