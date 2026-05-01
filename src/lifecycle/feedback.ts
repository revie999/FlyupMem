// src/lifecycle/feedback.ts — Feedback signals + auto-retirement

import type { FeedbackEntry, FeedbackSignal, Memory } from '../core/types.js'
import type { FlyupMemStore } from '../core/store.js'
import { generateFeedbackId } from '../core/id.js'

/**
 * Apply a feedback signal to a memory.
 * Updates activation, confidence, and may trigger auto-retirement.
 */
export function applyFeedback(
  memoryId: string,
  signal: FeedbackSignal,
  store: FlyupMemStore,
  context?: string,
): { applied: boolean; retired: boolean; reason?: string } {
  const mem = store.getById(memoryId)
  if (!mem) return { applied: false, retired: false, reason: 'memory not found' }

  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  // Record feedback entry
  const fb: FeedbackEntry = {
    id: generateFeedbackId(),
    memory_id: memoryId,
    signal,
    context: context ?? null,
    created_at: now,
  }
  store.addFeedback(fb)

  // Update feedback counts on the memory
  if ('feedback' in mem && mem.feedback) {
    if (signal === 'positive') mem.feedback.positive++
    else if (signal === 'negative') mem.feedback.negative++
    else mem.feedback.neutral++
  }

  // Update activation based on signal
  if (signal === 'positive') {
    mem.activation.storage_strength = Math.min(1.0, mem.activation.storage_strength + 0.1)
    mem.activation.retrieval_strength = Math.min(1.0, mem.activation.retrieval_strength + 0.05)
    if ('confidence' in mem) {
      mem.confidence = Math.min(10, (mem.confidence ?? 5) + 1)
    }
  } else if (signal === 'negative') {
    mem.activation.storage_strength = Math.max(0.0, mem.activation.storage_strength - 0.15)
    mem.activation.retrieval_strength = Math.max(0.0, mem.activation.retrieval_strength - 0.1)
    if ('confidence' in mem) {
      mem.confidence = Math.max(1, (mem.confidence ?? 5) - 1)
    }
  }

  mem.activation.last_accessed = today

  // Auto-retirement: 3 consecutive negative feedbacks in 30 days
  let retired = false
  if (signal === 'negative') {
    const recentNegatives = store.countRecentFeedback(memoryId, 'negative', 30)
    if (recentNegatives >= 3 && mem.status !== 'locked') {
      mem.status = 'retired'
      retired = true
    }
  }

  // Update the memory in store
  if (mem.layer === 'raw') {
    store.updateEngram(memoryId, mem as any)
  }

  store.save()

  return { applied: true, retired, reason: retired ? '3 consecutive negatives → retired' : undefined }
}

/**
 * Get feedback summary for a memory.
 */
export function getFeedbackSummary(memoryId: string, store: FlyupMemStore) {
  const mem = store.getById(memoryId)
  if (!mem) return null

  const recentFeedback = store.feedback
    .filter(fb => fb.memory_id === memoryId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10)

  return {
    memoryId,
    feedback: 'feedback' in mem ? (mem as any).feedback : { positive: 0, negative: 0, neutral: 0 },
    recentFeedback,
    totalFeedback: store.feedback.filter(fb => fb.memory_id === memoryId).length,
  }
}
