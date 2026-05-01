// src/tools/flyup_maintain.ts — Maintenance operations tool

import type { FlyupMemStore } from '../core/store.js'
import { batchDecay } from '../lifecycle/batch-decay.js'
import { consolidateUnmerged } from '../lifecycle/consolidate.js'
import { maintainGraphBulk } from '../lifecycle/graph-maintain.js'

export interface MaintainResult {
  decay: { processed: number; statusChanges: number }
  consolidation: { merged: number; conflicts: number; skipped: number }
  graph: { processed: number }
}

/**
 * Run all maintenance operations.
 */
export async function flyupMaintain(store: FlyupMemStore): Promise<MaintainResult> {
  store.load()

  // 1. Batch decay
  const decayResult = batchDecay(store)

  // 2. Consolidate unmerged engrams
  const consolidateResult = await consolidateUnmerged(store)

  // 3. Graph maintenance
  const graphResult = maintainGraphBulk(store)

  return {
    decay: { processed: decayResult.processed, statusChanges: decayResult.statusChanges.length },
    consolidation: consolidateResult,
    graph: graphResult,
  }
}
