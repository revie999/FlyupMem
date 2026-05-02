// src/tools/flyup_status.ts — Memory statistics with human-readable formatting

import type { FlyupMemStore } from '../core/store.js'

export interface StatusResult {
  stats: ReturnType<FlyupMemStore['stats']>
  health: ReturnType<FlyupMemStore['healthCheck']>
  summary: string
}

/**
 * Get memory store statistics and health, with human-readable summary.
 */
export function flyupStatus(store: FlyupMemStore): StatusResult {
  store.load()
  const stats = store.stats()
  const health = store.healthCheck()

  const total = stats.engrams.total
  const active = stats.engrams.active
  const candidate = stats.engrams.candidate
  const obs = stats.observations
  const mm = stats.mentalModels

  const parts: string[] = []
  parts.push(`${total} memories (${active} active, ${candidate} candidate)`)
  if (obs > 0) parts.push(`${obs} observations`)
  if (mm > 0) parts.push(`${mm} mental models`)
  parts.push(`graph: ${stats.graphEntities} entities, ${stats.graphEdges} edges`)

  // SQLite cache stats
  const cacheStats = store.cache.stats()
  if (cacheStats.ftsRows > 0) {
    const sizeKB = (cacheStats.dbSizeBytes / 1024).toFixed(1)
    parts.push(`sqlite: ${cacheStats.ftsRows} fts, ${cacheStats.metaRows} meta, ${sizeKB}KB`)
  }

  if (stats.feedback > 0) parts.push(`${stats.feedback} feedback entries`)
  if (!health.ok) parts.push(`⚠ ${health.issues.join('; ')}`)

  return {
    stats,
    health,
    summary: parts.join(' | '),
  }
}
