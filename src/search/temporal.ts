// src/search/temporal.ts — Temporal search with BFS diffusion

import type { ScoredResult, Memory, GraphData } from '../core/types.js'

/**
 * Compute time relevance between a query time reference and a memory's learned_at.
 * Returns 0-1 score based on temporal proximity.
 */
function timeRelevance(queryTimeRef: string, learnedAt: string): number {
  const queryTime = new Date(queryTimeRef).getTime()
  const memTime = new Date(learnedAt).getTime()
  const daysDiff = Math.abs(queryTime - memTime) / (1000 * 60 * 60 * 24)

  // Exponential decay: same day = 1.0, 7 days = 0.5, 30 days = 0.1
  return Math.exp(-daysDiff / 10)
}

/**
 * Extract a time reference from a query string.
 * Looks for dates, "today", "yesterday", "last week", etc.
 */
export function extractTimeReference(query: string): string | null {
  // ISO date pattern
  const isoMatch = query.match(/\d{4}-\d{2}-\d{2}/)
  if (isoMatch) return isoMatch[0]

  // Relative dates
  const now = new Date()
  if (/今天|today/i.test(query)) return now.toISOString().slice(0, 10)
  if (/昨天|yesterday/i.test(query)) {
    const d = new Date(now.getTime() - 86400_000)
    return d.toISOString().slice(0, 10)
  }
  if (/上周|last week/i.test(query)) {
    const d = new Date(now.getTime() - 7 * 86400_000)
    return d.toISOString().slice(0, 10)
  }
  if (/上个月|last month/i.test(query)) {
    const d = new Date(now.getTime() - 30 * 86400_000)
    return d.toISOString().slice(0, 10)
  }

  return null
}

/**
 * Get temporal/causal links from a memory.
 */
function getTemporalLinks(
  memoryId: string,
  graph: GraphData,
): Array<{ toId: string; weight: number }> {
  return graph.edges
    .filter(e => e.from === memoryId && (e.type === 'temporal' || e.type === 'causal'))
    .map(e => ({ toId: e.to, weight: e.weight }))
}

/**
 * Temporal search: time-window matching + BFS diffusion along temporal/causal links.
 */
export function temporalSearch(
  query: string,
  memories: Memory[],
  graph: GraphData,
  queryTimeRef?: string | null,
  limit = 30,
): ScoredResult[] {
  const timeRef = queryTimeRef ?? extractTimeReference(query)
  if (!timeRef) return []

  // Phase 1: Time window matching
  const candidates = memories
    .filter(m => m.temporal?.learned_at)
    .map(m => ({
      id: m.id,
      score: timeRelevance(timeRef, m.temporal!.learned_at),
    }))
    .filter(c => c.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)

  // Phase 2: BFS diffusion along temporal/causal links
  const scores = new Map(candidates.map(c => [c.id, c.score]))
  const visited = new Set(scores.keys())

  for (let round = 0; round < 3; round++) {
    const newEntries: [string, number][] = []

    for (const [entryId, entryScore] of scores) {
      const links = getTemporalLinks(entryId, graph)
      for (const link of links) {
        if (!visited.has(link.toId)) {
          const propagated = entryScore * link.weight * 0.7
          if (propagated >= 0.1) {
            newEntries.push([link.toId, propagated])
            visited.add(link.toId)
          }
        }
      }
    }

    for (const [id, score] of newEntries) {
      scores.set(id, score)
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
