// src/tools/flyup_feedback.ts — Feedback tool

import type { FlyupMemStore } from '../core/store.js'
import type { FeedbackSignal } from '../core/types.js'
import { applyFeedback, getFeedbackSummary } from '../lifecycle/feedback.js'

export interface FeedbackResult {
  applied: boolean
  retired: boolean
  reason?: string
  summary?: ReturnType<typeof getFeedbackSummary>
}

/**
 * Record a feedback signal for a memory.
 */
export function flyupFeedback(
  memoryId: string,
  signal: FeedbackSignal,
  store: FlyupMemStore,
  context?: string,
): FeedbackResult {
  store.load()
  const result = applyFeedback(memoryId, signal, store, context)
  const summary = getFeedbackSummary(memoryId, store)
  return { ...result, summary: summary ?? undefined }
}
