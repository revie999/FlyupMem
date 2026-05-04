// src/core/schema.ts — Zod schemas for runtime validation

import { z } from 'zod'

// ─── Enums ─────────────────────────────────────────────────────
export const LayerSchema = z.enum(['mental_model', 'observation', 'raw', 'experience'])
export const StatusSchema = z.enum(['candidate', 'active', 'fading', 'dormant', 'retired', 'locked'])
export const MemoryTypeSchema = z.enum(['behavioral', 'terminological', 'procedural', 'architectural'])
export const MemoryClassSchema = z.enum(['semantic', 'episodic', 'procedural', 'metacognitive'])
export const PolaritySchema = z.enum(['do', 'dont']).nullable()
export const CommitmentSchema = z.enum(['exploring', 'leaning', 'decided', 'locked'])
export const TrendSchema = z.enum(['new', 'strengthening', 'stable', 'weakening', 'stale'])
export const FeedbackSignalSchema = z.enum(['positive', 'negative', 'neutral'])
export const AssociationTypeSchema = z.enum(['semantic', 'temporal', 'causal', 'co_accessed', 'entity', 'evidence'])

// ─── Shared sub-schemas ────────────────────────────────────────
export const ActivationSchema = z.object({
  retrieval_strength: z.number().min(0).max(1),
  storage_strength: z.number().min(0).max(1),
  frequency: z.number().int().min(0),
  turn_count: z.number().int().min(0).default(0),
  last_accessed: z.string(), // ISO date
})

export const EntitySchema = z.object({
  name: z.string(),
  type: z.string(),
})

export const TemporalSchema = z.object({
  learned_at: z.string(),
  valid_from: z.string(),
  valid_until: z.string().nullable(),
})

export const SourceSchema = z.object({
  episode_id: z.string().nullable(),
  quote: z.string(),
  origin: z.string(),
})

export const AssociationSchema = z.object({
  target: z.string(),
  type: AssociationTypeSchema,
  weight: z.number().min(0).max(1),
})

export const EvidenceSchema = z.object({
  engram_id: z.string(),
  quote: z.string(),
  timestamp: z.string(),
})

// ─── Engram (L3) ───────────────────────────────────────────────
export const EngramSchema = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  layer: z.literal('raw'),
  status: StatusSchema,
  consolidated: z.boolean(),
  consolidated_at: z.string().optional(),

  type: MemoryTypeSchema,
  memory_class: MemoryClassSchema,
  polarity: PolaritySchema,
  commitment: CommitmentSchema,
  scope: z.string(),
  visibility: z.string(),
  domain: z.string(),
  tags: z.array(z.string()),

  statement: z.string().min(1),
  rationale: z.string(),
  contraindications: z.array(z.string()),

  entities: z.array(EntitySchema),
  temporal: TemporalSchema,
  source: SourceSchema,

  activation: ActivationSchema,
  emotional_weight: z.number().int().min(1).max(10),
  confidence: z.number().int().min(1).max(10),

  content_hash: z.string(),
  associations: z.array(AssociationSchema),

  feedback: z.object({
    positive: z.number().int().min(0),
    negative: z.number().int().min(0),
    neutral: z.number().int().min(0),
  }),

  adoption_count: z.number().int().min(0).default(0),

  previous_version_ref: z.string().nullable(),
  derivation_count: z.number().int().min(1),
})

// ─── Observation (L2) ──────────────────────────────────────────
export const ObservationSchema = z.object({
  id: z.string(),
  layer: z.literal('observation'),
  status: StatusSchema,
  scope: z.string(),
  domain: z.string(),
  tags: z.array(z.string()),
  title: z.string(),
  statement: z.string(),

  source_memory_ids: z.array(z.string()),
  proof_count: z.number().int().min(1),
  evidence: z.array(EvidenceSchema),

  trend: TrendSchema,
  confidence: z.number().int().min(1).max(10),

  activation: ActivationSchema,
  emotional_weight: z.number().int().min(1).max(10),

  entities: z.array(EntitySchema),
  temporal: TemporalSchema,

  history: z.array(z.object({
    event: z.string(),
    at: z.string(),
    from: z.array(z.string()),
  })),
})

// ─── Mental Model (L1) ─────────────────────────────────────────
export const MentalModelSchema = z.object({
  id: z.string(),
  layer: z.literal('mental_model'),
  status: StatusSchema,
  scope: z.string(),
  domain: z.string(),
  tags: z.array(z.string()),
  title: z.string(),
  statement: z.string(),

  source_observation_ids: z.array(z.string()),
  proof_count: z.number().int().min(1),
  confidence: z.number().int().min(1).max(10),
  trend: TrendSchema,

  refresh_policy: z.object({
    cadence: z.string(),
    stale_after_days: z.number().int(),
  }),
  last_refreshed: z.string(),

  activation: ActivationSchema,
  emotional_weight: z.number().int().min(1).max(10),
  entities: z.array(EntitySchema),
  temporal: TemporalSchema,
})

// ─── Episode ───────────────────────────────────────────────────
export const EpisodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['turn', 'summary', 'checkpoint']).optional(),
  timestamp: z.string(),
  agent: z.string(),
  channel: z.string(),
  scope: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  created_engram_ids: z.array(z.string()),
  checkpoint_label: z.string().optional(),
  next_steps: z.array(z.string()).optional(),
  context: z.string().optional(),
})

// ─── Graph ─────────────────────────────────────────────────────
export const GraphDataSchema = z.object({
  entities: z.record(z.object({
    type: z.string(),
    memory_ids: z.array(z.string()),
  })),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    type: AssociationTypeSchema,
    weight: z.number(),
  })),
})

// ─── Feedback entry ────────────────────────────────────────────
export const FeedbackEntrySchema = z.object({
  id: z.string(),
  memory_id: z.string(),
  signal: FeedbackSignalSchema,
  context: z.string().nullable(),
  created_at: z.string(),
})

// ─── Union schema for validation ───────────────────────────────
export const MemorySchema = z.discriminatedUnion('layer', [
  EngramSchema,
  ObservationSchema,
  MentalModelSchema,
])
