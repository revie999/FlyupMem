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
 * Compute current activation score (retrieval strength + frequency boost).
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
  return Math.min(1.0, rs + freqBoost)
}

/**
 * Get days since ISO date string.
 */
export function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime()
  const now = Date.now()
  return Math.max(0, (now - then) / (1000 * 60 * 60 * 24))
}
