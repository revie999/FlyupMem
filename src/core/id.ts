// src/core/id.ts — ID generation

import { Layer } from './types.js'

const PREFIXES: Record<Layer, string> = {
  mental_model: 'MM',
  observation: 'OBS',
  raw: 'ENG',
  experience: 'EXP',
}

/**
 * Generate a layer-prefixed ID: ENG-20260501-001
 */
export function generateId(layer: Layer, sequence?: number): string {
  const prefix = PREFIXES[layer]
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const seq = String(sequence ?? Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `${prefix}-${date}-${seq}`
}

/**
 * Generate episode ID
 */
export function generateEpisodeId(): string {
  return generateId('experience').replace('EXP-', 'EP-')
}

/**
 * Generate feedback ID
 */
export function generateFeedbackId(): string {
  const ts = Date.now().toString(36)
  return `FB-${ts}`
}

/**
 * Parse date from ID (ENG-20260501-001 → 2026-05-01)
 */
export function dateFromId(id: string): string | null {
  const match = id.match(/^[A-Z]+-(\d{8})-\d+$/)
  if (!match) return null
  const d = match[1]
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

/**
 * Get next sequence number for a given prefix+date combo
 */
export function nextSequence(existingIds: string[], layer: Layer): number {
  const prefix = PREFIXES[layer]
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const pattern = new RegExp(`^${prefix}-${date}-(\\d+)$`)
  let max = 0
  for (const id of existingIds) {
    const m = id.match(pattern)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}
