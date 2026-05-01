// src/lifecycle/dedup.ts — Content-hash dedup + high-similarity merge

import type { Engram } from '../core/types.js'
import { contentHash, isDuplicate } from '../core/hash.js'
import type { FlyupMemStore } from '../core/store.js'

/**
 * Result of deduplication check.
 */
export interface DedupResult {
  action: 'ADD' | 'SKIP' | 'UPDATE'
  existingId?: string
  reason?: string
}

/**
 * Check if a new engram is a duplicate or should be merged.
 */
export function deduplicate(newStatement: string, store: FlyupMemStore): DedupResult {
  const hash = contentHash(newStatement)

  // Exact duplicate → skip, bump frequency
  const existing = store.findByHash(hash)
  if (existing) {
    return { action: 'SKIP', existingId: existing.id, reason: 'exact_duplicate' }
  }

  // No duplicate found
  return { action: 'ADD' }
}

/**
 * Apply dedup result: if SKIP, bump frequency; if ADD, store the engram.
 */
export function applyDedup(
  engram: Engram,
  store: FlyupMemStore,
): DedupResult {
  const result = deduplicate(engram.statement, store)

  if (result.action === 'SKIP' && result.existingId) {
    // Bump frequency and update last_accessed
    const existing = store.getEngramById(result.existingId)
    if (existing) {
      store.updateEngram(result.existingId, {
        activation: {
          ...existing.activation,
          frequency: existing.activation.frequency + 1,
          last_accessed: new Date().toISOString().slice(0, 10),
        },
      })
    }
  } else if (result.action === 'ADD') {
    engram.content_hash = contentHash(engram.statement)
    store.addEngram(engram)
  }

  return result
}
