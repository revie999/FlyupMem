// src/search/rerank.ts — 8-dimensional local rerank

import type { Memory, ScoredResult } from '../core/types.js'
import { computeActivation, computeQualityScore } from '../lifecycle/decay.js'
import { daysSince } from '../lifecycle/decay.js'

interface RerankDimensions {
  relevance: number      // 0-1: BM25/semantic relevance score
  specificity: number    // 0-1: statement length / detail (longer = more specific)
  activation: number     // 0-1: ACT-R activation score
  recency: number        // 0-1: how recently learned
  evidenceStrength: number // 0-1: proof count / evidence chain
  confidence: number     // 0-1: normalized confidence (1-10 → 0-1)
  scope: number          // 0-1: scope match bonus
  polarity: number       // 0-1: polarity alignment with query intent
  quality: number        // 0-1: memory quality (turn count, decay ratio, consolidation, feedback balance)
}

const WEIGHTS: Record<keyof RerankDimensions, number> = {
  relevance: 0.22,
  specificity: 0.08,
  activation: 0.12,
  recency: 0.12,
  evidenceStrength: 0.08,
  confidence: 0.08,
  scope: 0.08,
  polarity: 0.04,
  quality: 0.18,
}

/**
 * Compute specificity from statement length (log-scaled).
 */
function computeSpecificity(statement: string): number {
  const len = statement.length
  return Math.min(1.0, Math.log1p(len) / Math.log1p(200))
}

/**
 * Compute recency score from learned_at date.
 */
function computeRecency(learnedAt: string | undefined): number {
  if (!learnedAt) return 0.5
  const days = daysSince(learnedAt)
  return Math.exp(-days / 30) // 30-day half-life
}

/**
 * Compute evidence strength from proof count and evidence chain.
 */
function computeEvidenceStrength(mem: Memory): number {
  let strength = 0

  if ('proof_count' in mem && mem.proof_count) {
    strength += Math.min(0.5, mem.proof_count * 0.1)
  }
  if ('evidence' in mem && Array.isArray((mem as any).evidence)) {
    strength += Math.min(0.3, (mem as any).evidence.length * 0.1)
  }
  if ('source_memory_ids' in mem && Array.isArray((mem as any).source_memory_ids)) {
    strength += Math.min(0.2, (mem as any).source_memory_ids.length * 0.05)
  }

  return Math.min(1.0, strength)
}

/**
 * Compute scope match: global gets base, matching scope gets bonus.
 */
function computeScopeMatch(memScope: string, queryScope: string | null): number {
  if (!queryScope) return 0.5 // no scope context
  if (memScope === 'global') return 0.7 // global is always relevant
  if (memScope === queryScope) return 1.0 // exact match
  if (memScope.startsWith(queryScope) || queryScope.startsWith(memScope)) return 0.8
  return 0.3
}

/**
 * Compute polarity alignment (simplified: do-match gets higher score).
 */
function computePolarity(polarity: 'do' | 'dont' | null): number {
  if (polarity === 'do') return 0.8
  if (polarity === 'dont') return 0.6 // still valuable, but slightly lower
  return 0.5
}

/**
 * 8-dimensional local rerank.
 * Takes a list of candidate memories with their relevance scores,
 * and re-ranks them using all 8 dimensions.
 */
export function localRerank(
  candidates: Array<{ memory: Memory; relevanceScore: number }>,
  queryScope?: string | null,
): ScoredResult[] {
  const scored = candidates.map(({ memory: mem, relevanceScore }) => {
    const dims: RerankDimensions = {
      relevance: Math.min(1.0, relevanceScore),
      specificity: computeSpecificity(mem.statement),
      activation: computeActivation(
        mem.activation,
        mem.layer as any,
        mem.emotional_weight ?? 5,
      ),
      recency: computeRecency(mem.temporal?.learned_at),
      evidenceStrength: computeEvidenceStrength(mem),
      confidence: (mem.confidence ?? 5) / 10,
      scope: computeScopeMatch(mem.scope ?? 'global', queryScope ?? null),
      polarity: computePolarity((mem as any).polarity ?? null),
      quality: computeQualityScore(
        mem.activation,
        mem.layer as any,
        mem.emotional_weight ?? 5,
        (mem as any).consolidated ?? false,
        (mem as any).feedback,
        (mem as any).adoption_count ?? 0,
      ),
    }

    // Weighted sum
    let finalScore = 0
    for (const [dim, weight] of Object.entries(WEIGHTS)) {
      finalScore += dims[dim as keyof RerankDimensions] * weight
    }

    return { id: mem.id, score: finalScore }
  })

  return scored.sort((a, b) => b.score - a.score)
}
