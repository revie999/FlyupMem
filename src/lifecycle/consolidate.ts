// src/lifecycle/consolidate.ts — Observation auto-merge via embedding clustering

import type { Engram, Observation, Evidence } from '../core/types.js'
import { generateId } from '../core/id.js'
import { embed, cosineSimilarity } from '../search/embed.js'
import type { FlyupMemStore } from '../core/store.js'

/**
 * Cluster engrams by embedding similarity.
 * Groups engrams with cosine similarity > threshold into clusters.
 */
export async function clusterByEmbedding(
  engrams: Engram[],
  threshold = 0.85,
): Promise<Engram[][]> {
  // Compute embeddings for all engrams
  const embeddings = new Map<string, Float32Array>()
  for (const eng of engrams) {
    const emb = await embed(eng.statement)
    if (emb) embeddings.set(eng.id, emb)
  }

  // Greedy clustering: assign each engram to the first cluster it's similar to
  const clusters: Engram[][] = []
  const assigned = new Set<string>()

  for (const eng of engrams) {
    if (assigned.has(eng.id)) continue
    const engEmb = embeddings.get(eng.id)
    if (!engEmb) continue

    const cluster: Engram[] = [eng]
    assigned.add(eng.id)

    for (const other of engrams) {
      if (assigned.has(other.id)) continue
      const otherEmb = embeddings.get(other.id)
      if (!otherEmb) continue

      const sim = cosineSimilarity(engEmb, otherEmb)
      if (sim >= threshold) {
        cluster.push(other)
        assigned.add(other.id)
      }
    }

    clusters.push(cluster)
  }

  return clusters.filter(c => c.length >= 2) // Only clusters with ≥2 members
}

/**
 * Detect polarity conflicts within a cluster.
 */
export function hasPolarityConflict(cluster: Engram[]): boolean {
  const polarities = new Set(cluster.filter(m => m.polarity).map(m => m.polarity))
  return polarities.size > 1
}

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[\s,.;:!?，。；：！？、()（）\[\]{}<>《》"']+/).filter(t => t.length >= 2))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  a.forEach(token => { if (b.has(token)) intersection++ })
  const union = new Set([...Array.from(a), ...Array.from(b)]).size
  return union > 0 ? intersection / union : 0
}

function clusterFacet(cluster: Engram[]): string {
  const first = cluster[0]
  return [first.scope ?? 'global', first.domain ?? 'general', first.type ?? 'behavioral'].join('|')
}

function observationFacet(obs: Observation): string {
  return [obs.scope ?? 'global', obs.domain ?? 'general'].join('|')
}

function entityOverlap(cluster: Engram[], obs: Observation): boolean {
  const clusterEntities = new Set(cluster.flatMap(e => (e.entities ?? []).map(entity => entity.name)))
  const obsEntities = new Set((obs.entities ?? []).map(entity => entity.name))
  if (clusterEntities.size === 0 || obsEntities.size === 0) return false
  return Array.from(clusterEntities).some(name => obsEntities.has(name))
}

function tagOverlap(cluster: Engram[], obs: Observation): boolean {
  const clusterTags = new Set(cluster.flatMap(e => e.tags ?? []))
  if (clusterTags.size === 0 || obs.tags.length === 0) return false
  return obs.tags.some(tag => clusterTags.has(tag))
}

/**
 * Find an existing Observation that tracks the same facet as a new cluster.
 * This is deliberately conservative: same scope/domain plus shared entity/tag
 * or strong text overlap. If uncertain, create a new Observation instead.
 */
export function findMatchingObservation(cluster: Engram[], store: FlyupMemStore): Observation | null {
  if (cluster.length === 0) return null
  const [scope, domain] = clusterFacet(cluster).split('|')
  const clusterText = tokenSet(cluster.map(e => e.statement).join(' '))

  let best: { obs: Observation; score: number } | null = null
  for (const obs of store.observations) {
    if (obs.status === 'retired') continue
    if (observationFacet(obs) !== `${scope}|${domain}`) continue
    const alreadyLinked = cluster.every(e => obs.source_memory_ids.includes(e.id))
    if (alreadyLinked) continue

    let score = jaccard(clusterText, tokenSet(`${obs.title} ${obs.statement}`))
    if (entityOverlap(cluster, obs)) score += 0.35
    if (tagOverlap(cluster, obs)) score += 0.15

    if (score >= 0.35 && (!best || score > best.score)) best = { obs, score }
  }
  return best?.obs ?? null
}

/**
 * Add new evidence to an existing Observation instead of creating duplicates.
 */
export function updateObservationFromCluster(obs: Observation, cluster: Engram[], store: FlyupMemStore): Observation {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const existingIds = new Set(obs.source_memory_ids)
  const newEngrams = cluster.filter(e => !existingIds.has(e.id))
  if (newEngrams.length === 0) return obs

  const source_memory_ids = [...obs.source_memory_ids, ...newEngrams.map(e => e.id)]
  const evidence = [
    ...obs.evidence,
    ...newEngrams.map(eng => ({
      engram_id: eng.id,
      quote: eng.source?.quote ?? eng.statement.slice(0, 200),
      timestamp: eng.temporal?.learned_at ?? now,
    })),
  ]

  const entityMap = new Map(obs.entities.map(entity => [entity.name, entity]))
  for (const eng of newEngrams) {
    for (const entity of eng.entities ?? []) {
      if (!entityMap.has(entity.name)) entityMap.set(entity.name, entity)
    }
  }

  const tags = Array.from(new Set([...obs.tags, ...newEngrams.flatMap(e => e.tags ?? [])]))
  const proof_count = source_memory_ids.length
  const avgNewConfidence = newEngrams.reduce((sum, e) => sum + (e.confidence ?? obs.confidence), 0) / newEngrams.length
  const confidence = Math.min(10, Math.round((obs.confidence * obs.proof_count + avgNewConfidence * newEngrams.length) / proof_count + 0.5))

  const updated: Observation = {
    ...obs,
    tags,
    source_memory_ids,
    proof_count,
    evidence,
    trend: proof_count >= obs.proof_count + 2 ? 'strengthening' : obs.trend === 'new' ? 'strengthening' : obs.trend,
    confidence,
    activation: {
      retrieval_strength: Math.max(obs.activation.retrieval_strength, ...newEngrams.map(e => e.activation?.retrieval_strength ?? 0.5)),
      storage_strength: Math.max(obs.activation.storage_strength, ...newEngrams.map(e => e.activation?.storage_strength ?? 0.5)),
      frequency: obs.activation.frequency + newEngrams.reduce((sum, e) => sum + (e.activation?.frequency ?? 1), 0),
      turn_count: obs.activation.turn_count + newEngrams.reduce((sum, e) => sum + (e.activation?.turn_count ?? 0), 0),
      last_accessed: today,
    },
    emotional_weight: Math.max(obs.emotional_weight, ...newEngrams.map(e => e.emotional_weight ?? 5)),
    entities: Array.from(entityMap.values()),
    history: [
      ...obs.history,
      { event: 'updated', at: now, from: newEngrams.map(e => e.id) },
    ],
  }

  store.updateObservation(obs.id, updated)
  return updated
}

/**
 * Merge a cluster of engrams into a single Observation.
 */
export function mergeToObservation(cluster: Engram[]): Observation {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  // Take the most representative statement (longest, most confident)
  const sorted = [...cluster].sort((a, b) => {
    const scoreA = (a.confidence ?? 5) + a.statement.length * 0.01
    const scoreB = (b.confidence ?? 5) + b.statement.length * 0.01
    return scoreB - scoreA
  })
  const representative = sorted[0]

  // Collect evidence
  const evidence: Evidence[] = cluster.map(eng => ({
    engram_id: eng.id,
    quote: eng.source?.quote ?? eng.statement.slice(0, 200),
    timestamp: eng.temporal?.learned_at ?? now,
  }))

  // Merge entities (deduplicate by name)
  const entityMap = new Map<string, { name: string; type: string }>()
  for (const eng of cluster) {
    for (const entity of eng.entities ?? []) {
      if (!entityMap.has(entity.name)) {
        entityMap.set(entity.name, entity)
      }
    }
  }

  // Merge tags
  const allTags = new Set<string>()
  for (const eng of cluster) {
    for (const tag of eng.tags ?? []) allTags.add(tag)
  }

  // Time range
  const timestamps = cluster
    .map(e => e.temporal?.learned_at)
    .filter(Boolean)
    .sort()

  return {
    id: generateId('observation'),
    layer: 'observation',
    status: 'active',
    scope: representative.scope ?? 'global',
    domain: representative.domain ?? 'general',
    tags: Array.from(allTags),
    title: representative.statement.slice(0, 80),
    statement: representative.statement,

    source_memory_ids: cluster.map(e => e.id),
    proof_count: cluster.length,
    evidence,

    trend: 'new',
    confidence: Math.min(10, Math.round(
      cluster.reduce((s, e) => s + (e.confidence ?? 5), 0) / cluster.length + 1
    )),

    activation: {
      retrieval_strength: Math.max(...cluster.map(e => e.activation?.retrieval_strength ?? 0.5)),
      storage_strength: Math.max(...cluster.map(e => e.activation?.storage_strength ?? 0.5)),
      frequency: cluster.reduce((s, e) => s + (e.activation?.frequency ?? 1), 0),
      turn_count: cluster.reduce((s, e) => s + (e.activation?.turn_count ?? 0), 0),
      last_accessed: today,
    },
    emotional_weight: Math.max(...cluster.map(e => e.emotional_weight ?? 5)),

    entities: Array.from(entityMap.values()),
    temporal: {
      learned_at: timestamps[0] ?? now,
      valid_from: timestamps[0] ?? now,
      valid_until: null,
    },

    history: [{
      event: 'created',
      at: now,
      from: cluster.map(e => e.id),
    }],
  }
}

/**
 * Mark engrams with polarity conflicts as evolution (don't merge).
 */
export function markAsEvolution(cluster: Engram[], store: FlyupMemStore): void {
  for (const eng of cluster) {
    store.updateEngram(eng.id, {
      associations: [
        ...eng.associations,
        ...cluster
          .filter(other => other.id !== eng.id)
          .map(other => ({
            target: other.id,
            type: 'semantic' as const,
            weight: 0.5,
          })),
      ],
    })
  }
}

/**
 * Main consolidation: find unmerged engrams, cluster, merge into Observations.
 */
export async function consolidateUnmerged(
  store: FlyupMemStore,
  batchSize = 50,
): Promise<{ merged: number; updated: number; conflicts: number; skipped: number }> {
  const unmerged = store.engrams
    .filter(m => m.layer === 'raw' && m.status === 'active' && !m.consolidated)
    .sort((a, b) => (a.temporal?.learned_at ?? '').localeCompare(b.temporal?.learned_at ?? ''))
    .slice(0, batchSize)

  if (unmerged.length < 2) return { merged: 0, updated: 0, conflicts: 0, skipped: 0 }

  const clusters = await clusterByEmbedding(unmerged, 0.85)

  let merged = 0
  let updated = 0
  let conflicts = 0
  const processedIds = new Set<string>()
  const now = new Date().toISOString()

  for (const cluster of clusters) {
    cluster.forEach(eng => processedIds.add(eng.id))

    // Check for polarity conflicts
    if (hasPolarityConflict(cluster)) {
      markAsEvolution(cluster, store)
      conflicts++
      continue
    }

    // Prefer updating an existing Observation for the same facet to avoid duplicates.
    const existing = findMatchingObservation(cluster, store)
    const observation = existing
      ? updateObservationFromCluster(existing, cluster, store)
      : mergeToObservation(cluster)

    if (!existing) store.addObservation(observation)

    // Mark source engrams as consolidated
    for (const eng of cluster) {
      store.updateEngram(eng.id, {
        consolidated: true,
        consolidated_at: now,
      })
    }

    // Add evidence edges to graph
    for (const eng of cluster) {
      store.addEdge(observation.id, eng.id, 'evidence', 0.8)
    }

    if (existing) updated++
    else merged++
  }

  if (merged > 0 || updated > 0 || conflicts > 0) {
    store.save()
  }

  return { merged, updated, conflicts, skipped: unmerged.length - processedIds.size }
}
