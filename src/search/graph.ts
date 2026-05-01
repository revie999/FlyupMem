// src/search/graph.ts — Graph expansion search

import type { ScoredResult, GraphData, Memory } from '../core/types.js'

/**
 * Get entity neighbors: memories that share entities with the seed.
 */
function getEntityNeighbors(
  seedId: string,
  memories: Memory[],
  graph: GraphData,
): Map<string, number> {
  const neighbors = new Map<string, number>()

  // Find entities of the seed memory
  const seed = memories.find(m => m.id === seedId)
  if (!seed) return neighbors

  const seedEntityNames = new Set(seed.entities.map(e => e.name))

  // Find other memories sharing those entities
  for (const [entityName, entityData] of Object.entries(graph.entities)) {
    if (!seedEntityNames.has(entityName)) continue
    for (const memId of entityData.memory_ids) {
      if (memId === seedId) continue
      neighbors.set(memId, (neighbors.get(memId) ?? 0) + 1)
    }
  }

  return neighbors
}

/**
 * Get links from a memory (by type).
 */
function getLinks(
  memoryId: string,
  linkType: string,
  graph: GraphData,
): Array<{ toId: string; weight: number }> {
  return graph.edges
    .filter(e => e.from === memoryId && e.type === linkType)
    .map(e => ({ toId: e.to, weight: e.weight }))
}

/**
 * Graph expansion: from seed memories, follow entity and semantic/causal links.
 */
export function graphExpansion(
  seedIds: string[],
  memories: Memory[],
  graph: GraphData,
  limit = 30,
): ScoredResult[] {
  const scores = new Map<string, number>()

  for (const seedId of seedIds) {
    // Entity expansion
    const entityNeighbors = getEntityNeighbors(seedId, memories, graph)
    for (const [neighborId, sharedCount] of entityNeighbors) {
      scores.set(neighborId, (scores.get(neighborId) ?? 0) + Math.tanh(sharedCount * 0.5))
    }

    // Semantic link expansion
    for (const link of getLinks(seedId, 'semantic', graph)) {
      scores.set(link.toId, (scores.get(link.toId) ?? 0) + link.weight)
    }

    // Causal link expansion (boosted)
    for (const link of getLinks(seedId, 'causal', graph)) {
      scores.set(link.toId, (scores.get(link.toId) ?? 0) + (link.weight + 1.0))
    }

    // Co-accessed link expansion
    for (const link of getLinks(seedId, 'co_accessed', graph)) {
      scores.set(link.toId, (scores.get(link.toId) ?? 0) + link.weight * 0.8)
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
