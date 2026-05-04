// src/core/types.ts — Core type definitions for FlyupMem

// ─── Layers ────────────────────────────────────────────────────
export type Layer = 'mental_model' | 'observation' | 'raw' | 'experience'
export const LAYER_ORDER: Record<Layer, number> = {
  mental_model: 1,
  observation: 2,
  raw: 3,
  experience: 4,
}

// ─── Status ────────────────────────────────────────────────────
export type Status = 'candidate' | 'active' | 'fading' | 'dormant' | 'retired' | 'locked'

// ─── Memory type / class ───────────────────────────────────────
export type MemoryType = 'behavioral' | 'terminological' | 'procedural' | 'architectural'
export type MemoryClass = 'semantic' | 'episodic' | 'procedural' | 'metacognitive'
export type Polarity = 'do' | 'dont' | null
export type Commitment = 'exploring' | 'leaning' | 'decided' | 'locked'

// ─── ACT-R Activation ──────────────────────────────────────────
export interface Activation {
  retrieval_strength: number   // [0, 1]
  storage_strength: number     // [0, 1]
  frequency: number
  turn_count: number           // how many conversation turns recalled this memory
  last_accessed: string        // ISO date (YYYY-MM-DD)
}

// ─── Entity ────────────────────────────────────────────────────
export interface Entity {
  name: string
  type: string                 // tool | person | project | concept | ...
}

// ─── Temporal ──────────────────────────────────────────────────
export interface Temporal {
  learned_at: string           // ISO datetime
  valid_from: string
  valid_until: string | null
}

// ─── Source ────────────────────────────────────────────────────
export interface Source {
  episode_id: string | null
  quote: string
  origin: string               // hermes:telegram | openclaw:webchat | mcp:claude | ...
}

// ─── Association ───────────────────────────────────────────────
export type AssociationType = 'semantic' | 'temporal' | 'causal' | 'co_accessed' | 'entity' | 'evidence'
export interface Association {
  target: string               // memory ID
  type: AssociationType
  weight: number
}

// ─── Feedback entry ────────────────────────────────────────────
export type FeedbackSignal = 'positive' | 'negative' | 'neutral'
export interface FeedbackEntry {
  id: string
  memory_id: string
  signal: FeedbackSignal
  context: string | null
  created_at: string
}

// ─── Evidence (for Observation) ────────────────────────────────
export interface Evidence {
  engram_id: string
  quote: string
  timestamp: string
}

// ─── Engram (L3) ───────────────────────────────────────────────
export interface Engram {
  id: string
  version: number
  layer: 'raw'
  status: Status
  consolidated: boolean
  consolidated_at?: string

  // Classification
  type: MemoryType
  memory_class: MemoryClass
  polarity: Polarity
  commitment: Commitment
  scope: string                // global | project:<name> | agent:<id> | channel:<id>
  visibility: string           // private | agent_private | channel
  domain: string
  tags: string[]

  // Content
  statement: string
  rationale: string
  contraindications: string[]

  // Entities & temporal
  entities: Entity[]
  temporal: Temporal
  source: Source

  // ACT-R
  activation: Activation
  emotional_weight: number     // 1-10
  confidence: number           // 1-10

  // Dedup & associations
  content_hash: string
  associations: Association[]

  // Feedback
  feedback: {
    positive: number
    negative: number
    neutral: number
  }

  // Adoption tracking
  adoption_count: number         // times positive feedback was given after recall

  // Provenance
  previous_version_ref: string | null
  derivation_count: number
}

// ─── Observation (L2) ──────────────────────────────────────────
export interface Observation {
  id: string
  layer: 'observation'
  status: Status
  scope: string
  domain: string
  tags: string[]
  title: string
  statement: string

  // Evidence chain
  source_memory_ids: string[]
  proof_count: number
  evidence: Evidence[]

  // Trend & confidence
  trend: 'new' | 'strengthening' | 'stable' | 'weakening' | 'stale'
  confidence: number           // 1-10

  // ACT-R
  activation: Activation
  emotional_weight: number

  // Entities
  entities: Entity[]
  temporal: Temporal

  // History
  history: Array<{
    event: string
    at: string
    from: string[]
  }>
}

// ─── Mental Model (L1) ─────────────────────────────────────────
export interface MentalModel {
  id: string
  layer: 'mental_model'
  status: Status
  scope: string
  domain: string
  tags: string[]
  title: string
  statement: string

  source_observation_ids: string[]
  proof_count: number
  confidence: number
  trend: 'new' | 'strengthening' | 'stable' | 'weakening' | 'stale'

  refresh_policy: {
    cadence: string            // daily | weekly | monthly
    stale_after_days: number
  }
  last_refreshed: string

  activation: Activation
  emotional_weight: number
  entities: Entity[]
  temporal: Temporal
}

// ─── Episode ───────────────────────────────────────────────────
export interface Episode {
  id: string
  kind?: 'turn' | 'summary' | 'checkpoint'
  timestamp: string
  agent: string
  channel: string
  scope: string
  summary: string
  tags: string[]
  created_engram_ids: string[]
  checkpoint_label?: string
  next_steps?: string[]
  context?: string
}

// ─── Graph ─────────────────────────────────────────────────────
export interface GraphData {
  entities: Record<string, {
    type: string
    memory_ids: string[]
  }>
  edges: Array<{
    from: string
    to: string
    type: AssociationType
    weight: number
  }>
}

// ─── Union type ────────────────────────────────────────────────
export type Memory = Engram | Observation | MentalModel

// ─── Scored result ─────────────────────────────────────────────
export interface ScoredResult {
  id: string
  score: number
}

// ─── Config ────────────────────────────────────────────────────
export interface FlyupMemConfig {
  store_path: string           // default ~/.flyupmem
  max_engrams_per_file: number // default 5000
  max_file_size_mb: number     // default 5
  decay_enabled: boolean       // default true
  consolidation_enabled: boolean // default true
  embedding_enabled: boolean   // default false (Phase 2)
  sqlite_enabled: boolean      // default true — FTS5 cache acceleration
  log_level: 'debug' | 'info' | 'warn' | 'error'
}

export const DEFAULT_CONFIG: FlyupMemConfig = {
  store_path: '~/.flyupmem',
  max_engrams_per_file: 5000,
  max_file_size_mb: 5,
  decay_enabled: true,
  consolidation_enabled: true,
  embedding_enabled: false,
  sqlite_enabled: true,
  log_level: 'info',
}
