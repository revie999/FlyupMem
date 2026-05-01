// src/tools/flyup_inspect.ts — Inspect a single memory in detail

import type { FlyupMemStore } from '../core/store.js'
import type { Memory, Engram, Observation, MentalModel } from '../core/types.js'
import { LAYER_ORDER } from '../core/types.js'
import { computeActivation, decayedStrength, daysSince } from '../lifecycle/decay.js'

export interface InspectResult {
  found: boolean
  memory?: MemoryDetail
  error?: string
}

export interface MemoryDetail {
  id: string
  layer: string
  status: string
  type?: string
  memoryClass?: string
  polarity?: string
  scope: string
  domain: string
  tags: string[]

  // Content
  statement: string
  title?: string
  rationale?: string
  summary?: string

  // Temporal
  learnedAt: string
  ageDays: number
  lastAccessed: string
  daysSinceAccess: number

  // Activation (current computed values)
  activation: {
    retrievalStrength: number
    storageStrength: number
    frequency: number
    computedActivation: number
    effectiveDecay: number
    layer: string
    layerLevel: number
  }

  // Relationships
  related: RelatedMemory[]
  graphEdges: GraphEdgeInfo[]
  feedback: FeedbackSummary

  // Evidence (for observations)
  evidence?: EvidenceInfo[]
  proofCount?: number
  trend?: string

  // Provenance
  confidence: number
  emotionalWeight: number
  contentHash: string
  derivationCount: number
  consolidated?: boolean
}

export interface RelatedMemory {
  id: string
  relationType: string
  weight: number
  statement: string
  status: string
}

export interface GraphEdgeInfo {
  direction: 'outgoing' | 'incoming'
  otherId: string
  edgeType: string
  weight: number
}

export interface FeedbackSummary {
  positive: number
  negative: number
  neutral: number
  recentEntries: Array<{
    signal: string
    context: string | null
    createdAt: string
  }>
}

export interface EvidenceInfo {
  engramId: string
  quote: string
  timestamp: string
}

/**
 * Inspect a single memory by ID: full detail, current activation,
 * related memories, graph edges, and feedback.
 */
export function flyupInspect(memoryId: string, store: FlyupMemStore): InspectResult {
  store.load()

  const memory = store.getById(memoryId)
  if (!memory) {
    return { found: false, error: `Memory not found: ${memoryId}` }
  }

  const layer = memory.layer
  const layerLevel = LAYER_ORDER[layer]
  const emotionalWeight = (memory as Engram).emotional_weight ?? 5

  // Compute current activation
  const daysSinceAccess = daysSince(memory.activation.last_accessed)
  const currentRs = decayedStrength(
    memory.activation.retrieval_strength,
    daysSinceAccess,
    layer,
    emotionalWeight,
  )
  const currentActivation = computeActivation(memory.activation, layer, emotionalWeight)
  const effectiveLambda = layer === 'raw' ? 0.05 * (1 - emotionalWeight / 20) :
    layer === 'observation' ? 0.025 * (1 - emotionalWeight / 20) :
    layer === 'mental_model' ? 0.01 * (1 - emotionalWeight / 20) :
    0.08 * (1 - emotionalWeight / 20)

  // Related memories via associations
  const related: RelatedMemory[] = []
  if ('associations' in memory && Array.isArray(memory.associations)) {
    for (const assoc of memory.associations) {
      const target = store.getById(assoc.target)
      if (target) {
        related.push({
          id: target.id,
          relationType: assoc.type,
          weight: assoc.weight,
          statement: (target as Engram).statement ?? (target as Observation).statement ?? '',
          status: target.status,
        })
      }
    }
  }

  // Graph edges
  const graphEdges: GraphEdgeInfo[] = []
  const graph = store.graph
  for (const edge of graph.edges) {
    if (edge.from === memoryId) {
      graphEdges.push({
        direction: 'outgoing',
        otherId: edge.to,
        edgeType: edge.type,
        weight: edge.weight,
      })
    } else if (edge.to === memoryId) {
      graphEdges.push({
        direction: 'incoming',
        otherId: edge.from,
        edgeType: edge.type,
        weight: edge.weight,
      })
    }
  }

  // Feedback
  const feedbackEntries = store.feedback.filter(fb => fb.memory_id === memoryId)
  const feedback: FeedbackSummary = {
    positive: (memory as Engram).feedback?.positive ?? 0,
    negative: (memory as Engram).feedback?.negative ?? 0,
    neutral: (memory as Engram).feedback?.neutral ?? 0,
    recentEntries: feedbackEntries.slice(-5).map(fb => ({
      signal: fb.signal,
      context: fb.context,
      createdAt: fb.created_at,
    })),
  }

  // Build result
  const detail: MemoryDetail = {
    id: memory.id,
    layer,
    status: memory.status,
    type: (memory as Engram).type,
    memoryClass: (memory as Engram).memory_class,
    polarity: (memory as Engram).polarity ?? undefined,
    scope: memory.scope,
    domain: (memory as Engram).domain ?? (memory as Observation).domain ?? '',
    tags: (memory as Engram).tags ?? (memory as Observation).tags ?? [],

    statement: (memory as Engram).statement ?? (memory as Observation).statement ?? '',
    title: (memory as Observation).title ?? (memory as MentalModel).title,
    rationale: (memory as Engram).rationale,

    learnedAt: (memory as Engram).temporal?.learned_at ?? '',
    ageDays: (memory as Engram).temporal?.learned_at ? daysSince((memory as Engram).temporal.learned_at) : 0,
    lastAccessed: memory.activation.last_accessed,
    daysSinceAccess,

    activation: {
      retrievalStrength: memory.activation.retrieval_strength,
      storageStrength: memory.activation.storage_strength,
      frequency: memory.activation.frequency,
      computedActivation: currentActivation,
      effectiveDecay: effectiveLambda,
      layer,
      layerLevel,
    },

    related,
    graphEdges,
    feedback,

    evidence: (memory as Observation).evidence?.map(e => ({
      engramId: e.engram_id,
      quote: e.quote,
      timestamp: e.timestamp,
    })),
    proofCount: (memory as Observation).proof_count,
    trend: (memory as Observation).trend,

    confidence: (memory as Engram).confidence ?? (memory as Observation).confidence ?? 5,
    emotionalWeight,
    contentHash: (memory as Engram).content_hash ?? '',
    derivationCount: (memory as Engram).derivation_count ?? 1,
    consolidated: (memory as Engram).consolidated,
  }

  return { found: true, memory: detail }
}
