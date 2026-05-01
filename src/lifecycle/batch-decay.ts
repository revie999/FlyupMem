// src/lifecycle/batch-decay.ts — Batch decay processing

import type { Engram, Observation, MentalModel, Status } from '../core/types.js'
import type { FlyupMemStore } from '../core/store.js'
import { decayedStrength, statusFromStrength } from './decay.js'

/**
 * Apply decay to all memories in the store.
 * Updates retrieval_strength and status based on time since last access.
 * Skips locked memories.
 */
export function batchDecay(store: FlyupMemStore): {
  processed: number
  statusChanges: Array<{ id: string; from: Status; to: string }>
} {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  let processed = 0
  const statusChanges: Array<{ id: string; from: Status; to: string }> = []

  // Decay engrams
  for (const eng of store.engrams) {
    if (eng.status === 'locked' || eng.status === 'retired') continue

    const lastAccess = new Date(eng.activation.last_accessed)
    const daysSince = (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24)

    if (daysSince < 0.5) continue // Skip if accessed today

    const newStrength = decayedStrength(
      eng.activation.retrieval_strength,
      daysSince,
      'raw',
      eng.emotional_weight ?? 5,
    )

    const oldStatus = eng.status
    const newStatus = statusFromStrength(newStrength) as Status

    eng.activation.retrieval_strength = newStrength

    if (newStatus !== oldStatus) {
      eng.status = newStatus
      statusChanges.push({ id: eng.id, from: oldStatus, to: newStatus })
    }

    processed++
  }

  // Decay observations
  for (const obs of store.observations) {
    if (obs.status === 'locked' || obs.status === 'retired') continue

    const lastAccess = new Date(obs.activation.last_accessed)
    const daysSince = (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24)

    if (daysSince < 0.5) continue

    const newStrength = decayedStrength(
      obs.activation.retrieval_strength,
      daysSince,
      'observation',
      obs.emotional_weight ?? 5,
    )

    const oldStatus = obs.status
    const newStatus = statusFromStrength(newStrength) as Status

    obs.activation.retrieval_strength = newStrength

    if (newStatus !== oldStatus) {
      obs.status = newStatus
      statusChanges.push({ id: obs.id, from: oldStatus, to: newStatus })
    }

    processed++
  }

  // Decay mental models
  for (const mm of store.mentalModels) {
    if (mm.status === 'locked' || mm.status === 'retired') continue

    const lastAccess = new Date(mm.activation.last_accessed)
    const daysSince = (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24)

    if (daysSince < 0.5) continue

    const newStrength = decayedStrength(
      mm.activation.retrieval_strength,
      daysSince,
      'mental_model',
      mm.emotional_weight ?? 5,
    )

    const oldStatus = mm.status
    const newStatus = statusFromStrength(newStrength) as Status

    mm.activation.retrieval_strength = newStrength

    if (newStatus !== oldStatus) {
      mm.status = newStatus
      statusChanges.push({ id: mm.id, from: oldStatus, to: newStatus })
    }

    processed++
  }

  if (processed > 0) {
    store.save()
  }

  return { processed, statusChanges }
}
