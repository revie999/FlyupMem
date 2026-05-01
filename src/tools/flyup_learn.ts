// src/tools/flyup_learn.ts — Learn from conversation

import type { FlyupMemStore } from '../core/store.js'
import { extractEngramsFromTurn } from '../lifecycle/extract.js'
import { applyDedup } from '../lifecycle/dedup.js'
import { contentHash } from '../core/hash.js'

export interface LearnResult {
  extracted: number
  stored: number
  skipped: number
  engramIds: string[]
}

/**
 * Learn from a conversation turn: extract → dedup → store.
 */
export function flyupLearn(
  userMsg: string,
  assistantMsg: string,
  store: FlyupMemStore,
  origin: string = 'hermes:telegram',
): LearnResult {
  store.load()

  const existingIds = store.engrams.map(e => e.id)
  const candidates = extractEngramsFromTurn(userMsg, assistantMsg, existingIds, origin)

  let stored = 0
  let skipped = 0
  const engramIds: string[] = []

  for (const candidate of candidates) {
    // Set content_hash
    const engram = { ...candidate, content_hash: contentHash(candidate.statement) }

    const result = applyDedup(engram as any, store)

    if (result.action === 'ADD') {
      stored++
      engramIds.push(engram.id)
    } else {
      skipped++
      if (result.existingId) engramIds.push(result.existingId)
    }
  }

  // Save if anything changed
  if (stored > 0 || skipped > 0) {
    store.save()
  }

  return {
    extracted: candidates.length,
    stored,
    skipped,
    engramIds,
  }
}
