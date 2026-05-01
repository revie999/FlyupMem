// src/search/recall.ts — Unified recall pipeline (Phase 1: BM25 only)

import type { Memory, ScoredResult } from '../core/types.js'
import type { FlyupMemStore } from '../core/store.js'
import { bm25Search } from './bm25.js'
import { computeActivation } from '../lifecycle/decay.js'

const TOKEN_BUDGET = 4096

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
  const layerBudgets = {
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
 * Unified recall: BM25 search + ACT-R activation weighting.
 * Phase 1 only; Phase 2 will add semantic, graph, temporal signals.
 */
export async function unifiedRecall(
  query: string,
  store: FlyupMemStore,
  tokenBudget = TOKEN_BUDGET,
): Promise<{ memories: Memory[]; injection: string }> {
  const allMemories = store.allMemories()

  // BM25 search
  const documents = allMemories.map(m => ({ id: m.id, text: m.statement }))
  const bm25Results = bm25Search(query, documents, 30)

  // ACT-R activation weighting
  const final: Array<{ memory: Memory; score: number }> = bm25Results.map(({ id, score: bm25Score }) => {
    const mem = allMemories.find(m => m.id === id)!
    const activation = computeActivation(
      mem.activation,
      mem.layer as any,
      mem.emotional_weight ?? 5,
    )
    return {
      memory: mem,
      score: bm25Score * 0.7 + activation * 0.3,
    }
  }).sort((a, b) => b.score - a.score)

  // Token budget trimming
  const trimmed = trimToTokenBudget(final, tokenBudget)

  // Format injection
  const injection = formatInjection(trimmed)

  return { memories: trimmed, injection }
}
