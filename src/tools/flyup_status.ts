// src/tools/flyup_status.ts — Memory statistics

import type { FlyupMemStore } from '../core/store.js'

export interface StatusResult {
  stats: ReturnType<FlyupMemStore['stats']>
  health: ReturnType<FlyupMemStore['healthCheck']>
}

/**
 * Get memory store statistics and health.
 */
export function flyupStatus(store: FlyupMemStore): StatusResult {
  store.load()
  return {
    stats: store.stats(),
    health: store.healthCheck(),
  }
}
