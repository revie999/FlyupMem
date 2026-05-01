// src/lifecycle/graph-maintain.ts — Automatic graph maintenance

import type { Memory } from '../core/types.js'
import type { FlyupMemStore } from '../core/store.js'

/**
 * Update graph entities from a memory's entity list.
 */
export function updateGraphEntities(mem: Memory, store: FlyupMemStore): void {
  for (const entity of mem.entities ?? []) {
    store.addEntity(entity.name, entity.type, mem.id)
  }
}

/**
 * Create co-access edges between memories that share entities.
 */
export function createCoAccessEdges(mem: Memory, store: FlyupMemStore): void {
  const graph = store.graph
  const memEntityNames = new Set((mem.entities ?? []).map(e => e.name))

  if (memEntityNames.size === 0) return

  // Find other memories sharing entities
  for (const [entityName, entityData] of Object.entries(graph.entities)) {
    if (!memEntityNames.has(entityName)) continue

    for (const otherId of entityData.memory_ids) {
      if (otherId === mem.id) continue

      // Check if edge already exists
      const exists = graph.edges.some(
        e => (e.from === mem.id && e.to === otherId && e.type === 'co_accessed') ||
             (e.from === otherId && e.to === mem.id && e.type === 'co_accessed')
      )

      if (!exists) {
        // Weight = number of shared entities / max possible
        const otherMem = store.getById(otherId)
        if (!otherMem) continue
        const otherEntityNames = new Set((otherMem.entities ?? []).map(e => e.name))
        const shared = [...memEntityNames].filter(n => otherEntityNames.has(n)).length
        const maxShared = Math.max(memEntityNames.size, otherEntityNames.size)
        const weight = maxShared > 0 ? shared / maxShared : 0

        store.addEdge(mem.id, otherId, 'co_accessed', weight)
      }
    }
  }
}

/**
 * Create temporal edges between memories learned close together.
 */
export function createTemporalEdges(mem: Memory, store: FlyupMemStore, windowHours = 2): void {
  const memTime = new Date(mem.temporal?.learned_at ?? 0).getTime()
  if (!memTime) return

  const windowMs = windowHours * 60 * 60 * 1000

  for (const other of store.allMemories()) {
    if (other.id === mem.id) continue
    const otherTime = new Date(other.temporal?.learned_at ?? 0).getTime()
    if (!otherTime) continue

    const diff = Math.abs(memTime - otherTime)
    if (diff <= windowMs) {
      // Check if edge already exists
      const exists = store.graph.edges.some(
        e => (e.from === mem.id && e.to === other.id && e.type === 'temporal') ||
             (e.from === other.id && e.to === mem.id && e.type === 'temporal')
      )

      if (!exists) {
        const weight = 1 - (diff / windowMs) // Closer = higher weight
        store.addEdge(mem.id, other.id, 'temporal', weight)
      }
    }
  }
}

/**
 * Run full graph maintenance on a memory.
 */
export function maintainGraph(mem: Memory, store: FlyupMemStore): void {
  updateGraphEntities(mem, store)
  createCoAccessEdges(mem, store)
  createTemporalEdges(mem, store)
}

/**
 * Run graph maintenance on all memories (bulk operation).
 */
export function maintainGraphBulk(store: FlyupMemStore): { processed: number } {
  const memories = store.allMemories()
  for (const mem of memories) {
    updateGraphEntities(mem, store)
  }
  // Co-access and temporal edges are expensive; do them in smaller batches
  let processed = 0
  for (const mem of memories.slice(0, 100)) {
    createCoAccessEdges(mem, store)
    createTemporalEdges(mem, store)
    processed++
  }
  return { processed }
}
