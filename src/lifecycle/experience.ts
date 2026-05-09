// src/lifecycle/experience.ts — Experience (L4) auto-induction from repeated patterns

import type { Experience, Memory, Observation, MentalModel, Entity } from '../core/types.js'
import type { FlyupMemStore } from '../core/store.js'
import { generateId, nextSequence } from '../core/id.js'

export interface ExperienceInductionOptions {
  /** Minimum memories required to induce an Experience. */
  minEvidence?: number
  /** Maximum Experiences to create in one run. */
  maxExperiences?: number
  /** Include mental models as evidence alongside observations. */
  includeMentalModels?: boolean
}

export interface ExperienceInductionResult {
  created: Experience[]
  skipped: number
  candidates: number
}

type EvidenceMemory = Observation | MentalModel

type CandidateCluster = {
  key: string
  memories: EvidenceMemory[]
  score: number
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,.;:!?，。；：！？、()（）\[\]{}<>《》"'`]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 2),
  )
}

function sharedTags(memories: EvidenceMemory[]): string[] {
  if (memories.length === 0) return []
  const counts = new Map<string, number>()
  for (const mem of memories) {
    for (const tag of Array.from(new Set(mem.tags ?? []))) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .map(([tag]) => tag)
}

function mergeEntities(memories: EvidenceMemory[]): Entity[] {
  const map = new Map<string, Entity>()
  for (const mem of memories) {
    for (const entity of mem.entities ?? []) {
      if (!map.has(entity.name)) map.set(entity.name, entity)
    }
  }
  return Array.from(map.values())
}

function rangeDate(memories: EvidenceMemory[], pick: 'first' | 'last'): string {
  const dates = memories
    .map(m => m.temporal?.learned_at ?? m.temporal?.valid_from)
    .filter(Boolean)
    .sort()
  const fallback = new Date().toISOString()
  if (dates.length === 0) return fallback
  return pick === 'first' ? dates[0] : dates[dates.length - 1]
}

function clusterKey(mem: EvidenceMemory): string {
  const tags = (mem.tags ?? []).slice().sort().slice(0, 3).join('+')
  const entity = (mem.entities ?? [])[0]?.name ?? ''
  const tokens = Array.from(tokenize(`${mem.title} ${mem.statement}`)).slice(0, 6).join('+')
  return [mem.scope || 'global', mem.domain || 'general', tags || entity || tokens].join('|')
}

function clusterScore(memories: EvidenceMemory[]): number {
  const proof = memories.reduce((sum, m) => sum + ('proof_count' in m ? m.proof_count : 1), 0)
  const confidence = memories.reduce((sum, m) => sum + (m.confidence ?? 5), 0) / memories.length
  const tagBoost = sharedTags(memories).length * 0.5
  return proof + confidence / 2 + tagBoost
}

function groupCandidates(memories: EvidenceMemory[], minEvidence: number): CandidateCluster[] {
  const groups = new Map<string, EvidenceMemory[]>()
  for (const mem of memories) {
    if (mem.status === 'retired') continue
    const key = clusterKey(mem)
    const group = groups.get(key) ?? []
    group.push(mem)
    groups.set(key, group)
  }

  return Array.from(groups.entries())
    .map(([key, group]) => ({ key, memories: group, score: clusterScore(group) }))
    .filter(cluster => cluster.memories.length >= minEvidence)
    .sort((a, b) => b.score - a.score)
}

function hasExistingExperience(store: FlyupMemStore, sourceIds: string[]): boolean {
  const ids = new Set(sourceIds)
  return store.experiences.some(exp => {
    if (exp.status === 'retired') return false
    const existing = new Set(exp.source_memory_ids)
    const overlap = sourceIds.filter(id => existing.has(id)).length
    return overlap >= Math.min(ids.size, 2)
  })
}

function inferPatternType(memories: EvidenceMemory[]): Experience['pattern_type'] {
  const text = memories.map(m => `${m.title} ${m.statement}`).join(' ').toLowerCase()
  if (/prefer|prefers|喜欢|偏好|希望|expects|wants/.test(text)) return 'preference'
  if (/workflow|process|step|procedure|debugging|diagnosis|evidence-first|流程|步骤|pipeline/.test(text)) return 'workflow'
  if (/because|cause|导致|由于|therefore|so /.test(text)) return 'cause_effect'
  if (/correlat|related|关联|相关/.test(text)) return 'correlation'
  return 'recurring'
}

function synthesizeStatement(memories: EvidenceMemory[]): string {
  const representative = [...memories].sort((a, b) => {
    const scoreA = (a.confidence ?? 5) + a.statement.length * 0.01
    const scoreB = (b.confidence ?? 5) + b.statement.length * 0.01
    return scoreB - scoreA
  })[0]
  const count = memories.length
  return `Repeated pattern across ${count} memories: ${representative.statement}`
}

export function createExperienceFromMemories(
  memories: EvidenceMemory[],
  existingIds: string[] = [],
): Experience {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const sourceIds = memories.map(m => m.id)
  const tags = Array.from(new Set([...sharedTags(memories), ...memories.flatMap(m => m.tags ?? [])])).slice(0, 12)
  const entities = mergeEntities(memories)
  const proof = memories.reduce((sum, m) => sum + ('proof_count' in m ? m.proof_count : 1), 0)
  const confidence = Math.min(10, Math.max(1, Math.round(memories.reduce((sum, m) => sum + (m.confidence ?? 5), 0) / memories.length + Math.min(2, memories.length / 3))))
  const emotionalWeight = Math.min(10, Math.max(1, Math.round(memories.reduce((sum, m) => sum + (m.emotional_weight ?? 5), 0) / memories.length)))
  const firstSeen = rangeDate(memories, 'first')
  const lastSeen = rangeDate(memories, 'last')
  const representative = memories[0]

  return {
    id: generateId('experience', nextSequence(existingIds, 'experience')),
    layer: 'experience',
    status: 'active',
    scope: representative.scope ?? 'global',
    domain: representative.domain ?? 'general',
    tags,
    title: representative.title || representative.statement.slice(0, 80),
    statement: synthesizeStatement(memories),
    source_memory_ids: sourceIds,
    evidence_summary: memories.map((m, i) => `[${i + 1}] ${m.title || m.statement}`).join('\n'),
    pattern_type: inferPatternType(memories),
    occurrence_count: Math.max(memories.length, proof),
    first_seen: firstSeen,
    last_seen: lastSeen,
    confidence,
    trend: 'new',
    activation: {
      retrieval_strength: Math.max(...memories.map(m => m.activation?.retrieval_strength ?? 0.5)),
      storage_strength: Math.max(...memories.map(m => m.activation?.storage_strength ?? 0.5)),
      frequency: memories.reduce((sum, m) => sum + (m.activation?.frequency ?? 1), 0),
      turn_count: memories.reduce((sum, m) => sum + (m.activation?.turn_count ?? 0), 0),
      last_accessed: today,
    },
    emotional_weight: emotionalWeight,
    entities,
    temporal: {
      learned_at: now,
      valid_from: firstSeen,
      valid_until: null,
    },
    history: [{ event: 'created', at: now, from: sourceIds }],
  }
}

export function induceExperiences(
  store: FlyupMemStore,
  options: ExperienceInductionOptions = {},
): ExperienceInductionResult {
  const minEvidence = options.minEvidence ?? 3
  const maxExperiences = options.maxExperiences ?? 5
  const includeMentalModels = options.includeMentalModels ?? true

  const memories: EvidenceMemory[] = [
    ...store.observations.filter(o => o.status === 'active' || o.status === 'candidate'),
    ...(includeMentalModels ? store.mentalModels.filter(m => m.status === 'active' || m.status === 'candidate') : []),
  ]

  const candidates = groupCandidates(memories, minEvidence)
  const created: Experience[] = []
  let skipped = 0
  const existingIds = [...store.experiences.map(e => e.id)]

  for (const candidate of candidates) {
    if (created.length >= maxExperiences) break
    const sourceIds = candidate.memories.map(m => m.id)
    if (hasExistingExperience(store, sourceIds)) {
      skipped++
      continue
    }
    const exp = createExperienceFromMemories(candidate.memories, [...existingIds, ...created.map(e => e.id)])
    store.addExperience(exp)
    created.push(exp)
  }

  if (created.length > 0) store.save()
  return { created, skipped, candidates: candidates.length }
}
