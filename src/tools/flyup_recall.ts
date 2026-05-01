// src/tools/flyup_recall.ts — Search memories

import type { FlyupMemStore } from '../core/store.js'
import type { Memory } from '../core/types.js'
import { unifiedRecall, formatInjection } from '../search/recall.js'

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
