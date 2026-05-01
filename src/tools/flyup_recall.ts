// src/tools/flyup_recall.ts — Search memories

import type { FlyupMemStore } from '../core/store.js'
import type { Memory } from '../core/types.js'
import { unifiedRecall, formatInjection, recallWithExplanation, type RecallWithExplanationResult } from '../search/recall.js'

export interface RecallResult {
  memories: Memory[]
  injection: string
  count: number
}

/**
 * Recall memories relevant to a query.
 */
export async function flyupRecall(
  query: string,
  store: FlyupMemStore,
  tokenBudget?: number,
): Promise<RecallResult> {
  store.load()
  const { memories, injection } = await unifiedRecall(query, store, tokenBudget)
  return { memories, injection, count: memories.length }
}

export async function flyupRecallExplain(
  query: string,
  store: FlyupMemStore,
  tokenBudget?: number,
): Promise<RecallWithExplanationResult & { count: number }> {
  store.load()
  const result = await recallWithExplanation(query, store, tokenBudget)
  return { ...result, count: result.memories.length }
}
