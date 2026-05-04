// src/search/recall.ts — Unified recall pipeline (Phase 2: multi-signal)

import type { Memory, ScoredResult } from '../core/types.js'
import type { FlyupMemStore } from '../core/store.js'
import { bm25Search } from './bm25.js'
import { semanticSearch } from './semantic.js'
import { graphExpansion } from './graph.js'
import { temporalSearch } from './temporal.js'
import { rrfMerge } from './rrf.js'
import { localRerank } from './rerank.js'
import { computeActivation } from '../lifecycle/decay.js'
import { initEmbedder, isEmbeddingAvailable } from './embed.js'

export interface SignalExplanation {
  matched: boolean
  available?: boolean
  score?: number
  rank?: number
}

export interface RecallExplanation {
  memory_id: string
  statement: string
  matched: boolean
  signals: {
    bm25: SignalExplanation
    semantic: SignalExplanation
    temporal: SignalExplanation
    graph: SignalExplanation
  }
  scores: {
    rrf: number
    activation: number
    activation_weighted: number
    rerank: number
  }
  reason: string
}

export interface RecallDiagnostics {
  query: string
  corpus_size: number
  semantic_available: boolean
  signal_counts: {
    bm25: number
    semantic: number
    temporal: number
    graph: number
    fused: number
    reranked: number
    injected: number
  }
  no_results_reason?: string
}

export interface RecallWithExplanationResult {
  memories: Memory[]
  injection: string
  explanations: RecallExplanation[]
  diagnostics: RecallDiagnostics
}

const TOKEN_BUDGET=2048

// Approximate token count (rough: 1 token ≈ 4 chars for English, ≈ 1.5 chars for Chinese)
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

/**
 * Trim scored results to fit within a token budget, prioritizing higher layers.
 */
function trimToTokenBudget(
  scored: Array<{ memory: Memory; score: number }>,
  budget: number,
): Memory[] {
  const layerBudgets: Record<number, number> = {
    1: Math.floor(budget * 0.40),  // Mental Models — 40%
    2: Math.floor(budget * 0.35),  // Observations — 35%
    3: Math.floor(budget * 0.20),  // Engrams — 20%
    4: Math.floor(budget * 0.05),  // Episodes — 5%
  }

  const layerMap: Record<string, number> = {
    mental_model: 1,
    observation: 2,
    raw: 3,
    experience: 4,
  }

  const selected: Memory[] = []
  const usedTokens: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }

  for (const { memory } of scored) {
    const layer = layerMap[memory.layer] ?? 3
    const tokens = estimateTokens(memory.statement)
    if (usedTokens[layer] + tokens <= layerBudgets[layer]) {
      selected.push(memory)
      usedTokens[layer] += tokens
    }
  }

  return selected
}

/**
 * Format memories into injection text with priority sections.
 */
export function formatInjection(memories: Memory[]): string {
  const directives: string[] = []
  const constraints: string[] = []
  const consider: string[] = []

  for (const mem of memories) {
    const line = `[${mem.id}] ${mem.statement}`
    if (mem.layer === 'mental_model') {
      directives.push(line)
    } else if (mem.layer === 'observation') {
      constraints.push(line)
    } else {
      consider.push(line)
    }
  }

  const sections: string[] = []
  if (directives.length === 0 && constraints.length === 0 && consider.length === 0) {
    return '<flyupmem-context>\n(no relevant memories)\n</flyupmem-context>'
  }

  if (directives.length > 0) {
    sections.push('### Directives (must follow)\n' + directives.join('\n'))
  }
  if (constraints.length > 0) {
    sections.push('### Constraints\n' + constraints.join('\n'))
  }
  if (consider.length > 0) {
    sections.push('### Consider\n' + consider.join('\n'))
  }

  return `<flyupmem-context>\n${sections.join('\n\n')}\n</flyupmem-context>`
}

/**
 * Unified recall: multi-signal retrieval with RRF fusion + ACT-R activation + 8-dim rerank.
 *
 * Signals (in parallel where possible):
 * 1. BM25 — keyword matching
 * 2. Semantic — embedding similarity (if model available)
 * 3. Graph — entity + link expansion (from BM25 seeds)
 * 4. Temporal — time-window + BFS diffusion
 * 5. Activation — ACT-R decay model
 *
 * Pipeline:
 * BM25 + Semantic + Temporal (parallel) → Graph (from BM25 seeds) → RRF fusion → ACT-R weighting → Rerank → Token trim
 */
function signalFor(id: string, results: ScoredResult[], available = true): SignalExplanation {
  const index = results.findIndex(r => r.id === id)
  if (index === -1) return { matched: false, available }
  return {
    matched: true,
    available,
    score: results[index].score,
    rank: index + 1,
  }
}

function buildReason(signals: RecallExplanation['signals']): string {
  const matched = Object.entries(signals)
    .filter(([, signal]) => signal.matched)
    .map(([name]) => name)
  return matched.length > 0
    ? `Matched retrieval signals: ${matched.join(', ')}`
    : 'No retrieval signals matched'
}

export async function recallWithExplanation(
  query: string,
  store: FlyupMemStore,
  tokenBudget = TOKEN_BUDGET,
  queryScope?: string | null,
): Promise<RecallWithExplanationResult> {
  const allMemories = store.allMemories()
  const documents = allMemories.map(m => ({ id: m.id, text: m.statement }))
  const semanticEnabled = store.config.embedding_enabled
  const semanticAvailable = semanticEnabled
    ? (isEmbeddingAvailable() || await initEmbedder({ timeoutMs: 1_500 }))
    : false

  // ─── Signal 1: BM25 (always available, FTS5 accelerated) ───
  const bm25Results = bm25Search(query, documents, 30, store.cache)

  // ─── Signal 2: Semantic (if embedding model loaded) ─────────
  let semanticResults: ScoredResult[] = []
  if (semanticAvailable) {
    semanticResults = await semanticSearch(query, allMemories, 30, store)
  }

  // ─── Signal 3: Temporal ─────────────────────────────────────
  const temporalResults = temporalSearch(query, allMemories, store.graph, undefined, 30)

  // ─── Signal 4: Graph expansion (from BM25 top seeds) ────────
  const seedIds = bm25Results.slice(0, 10).map(r => r.id)
  const graphResults = graphExpansion(seedIds, allMemories, store.graph, 30)

  // ─── RRF Fusion ─────────────────────────────────────────────
  const signalLists = [bm25Results, temporalResults, graphResults]
  if (semanticResults.length > 0) signalLists.push(semanticResults)

  const fused = rrfMerge(signalLists)
  const fusedById = new Map(fused.map(r => [r.id, r.score]))

  // ─── ACT-R activation weighting ─────────────────────────────
  const activationById = new Map<string, number>()
  const activationWeightedById = new Map<string, number>()
  const withActivation = fused.map(({ id, score: rrfScore }) => {
    const mem = allMemories.find(m => m.id === id)
    if (!mem) return { id, score: rrfScore, memory: null as any }
    const activation = computeActivation(
      mem.activation,
      mem.layer as any,
      mem.emotional_weight ?? 5,
    )
    const activationWeighted = rrfScore * 0.7 + activation * 0.3
    activationById.set(id, activation)
    activationWeightedById.set(id, activationWeighted)
    return {
      id,
      score: activationWeighted,
      memory: mem,
    }
  }).filter(r => r.memory !== null)

  // ─── 8-dim Local Rerank ─────────────────────────────────────
  const reranked = localRerank(
    withActivation.map(r => ({ memory: r.memory, relevanceScore: r.score })),
    queryScope ?? null,
  )
  const rerankById = new Map(reranked.map(r => [r.id, r.score]))

  // ─── Resolve memories and trim to token budget ──────────────
  const final = reranked
    .map(({ id, score }) => {
      const mem = allMemories.find(m => m.id === id)
      return mem ? { memory: mem, score } : null
    })
    .filter((r): r is { memory: Memory; score: number } => r !== null)

  const trimmed = trimToTokenBudget(final, tokenBudget)
  const injection = formatInjection(trimmed)

  // ─── Increment turn_count for recalled memories ─────────────
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  let needsSave = false
  for (const mem of trimmed) {
    if ('activation' in mem && mem.activation) {
      mem.activation.turn_count = (mem.activation.turn_count ?? 0) + 1
      mem.activation.last_accessed = today
      if ('consolidated' in mem) {
        store.updateEngram(mem.id, { activation: mem.activation } as any)
      } else if (mem.layer === 'observation') {
        store.updateObservation(mem.id, { activation: mem.activation } as any)
      } else if (mem.layer === 'mental_model') {
        store.updateMentalModel(mem.id, { activation: mem.activation } as any)
      }
      needsSave = true
    }
  }
  if (needsSave) store.save()

  const explanations = trimmed.map((mem): RecallExplanation => {
    const signals = {
      bm25: signalFor(mem.id, bm25Results),
      semantic: signalFor(mem.id, semanticResults, semanticAvailable),
      temporal: signalFor(mem.id, temporalResults),
      graph: signalFor(mem.id, graphResults),
    }
    return {
      memory_id: mem.id,
      statement: mem.statement,
      matched: true,
      signals,
      scores: {
        rrf: fusedById.get(mem.id) ?? 0,
        activation: activationById.get(mem.id) ?? 0,
        activation_weighted: activationWeightedById.get(mem.id) ?? 0,
        rerank: rerankById.get(mem.id) ?? 0,
      },
      reason: buildReason(signals),
    }
  })

  const diagnostics: RecallDiagnostics = {
    query,
    corpus_size: allMemories.length,
    semantic_available: semanticAvailable,
    signal_counts: {
      bm25: bm25Results.length,
      semantic: semanticResults.length,
      temporal: temporalResults.length,
      graph: graphResults.length,
      fused: fused.length,
      reranked: reranked.length,
      injected: trimmed.length,
    },
  }
  if (trimmed.length === 0) {
    diagnostics.no_results_reason = fused.length === 0
      ? 'No retrieval signals matched this query.'
      : 'Retrieval candidates were filtered out by token budget or relevance gates.'
  }

  return { memories: trimmed, injection, explanations, diagnostics }
}

export async function unifiedRecall(
  query: string,
  store: FlyupMemStore,
  tokenBudget = TOKEN_BUDGET,
  queryScope?: string | null,
): Promise<{ memories: Memory[]; injection: string }> {
  const result = await recallWithExplanation(query, store, tokenBudget, queryScope)
  return { memories: result.memories, injection: result.injection }
}
