export type Layer = 'mental_model' | 'observation' | 'raw' | 'experience';
export declare const LAYER_ORDER: Record<Layer, number>;
export type Status = 'candidate' | 'active' | 'fading' | 'dormant' | 'retired' | 'locked';
export type MemoryType = 'behavioral' | 'terminological' | 'procedural' | 'architectural';
export type MemoryClass = 'semantic' | 'episodic' | 'procedural' | 'metacognitive';
export type Polarity = 'do' | 'dont' | null;
export type Commitment = 'exploring' | 'leaning' | 'decided' | 'locked';
export interface Activation {
    retrieval_strength: number;
    storage_strength: number;
    frequency: number;
    last_accessed: string;
}
export interface Entity {
    name: string;
    type: string;
}
export interface Temporal {
    learned_at: string;
    valid_from: string;
    valid_until: string | null;
}
export interface Source {
    episode_id: string | null;
    quote: string;
    origin: string;
}
export type AssociationType = 'semantic' | 'temporal' | 'causal' | 'co_accessed' | 'entity' | 'evidence';
export interface Association {
    target: string;
    type: AssociationType;
    weight: number;
}
export type FeedbackSignal = 'positive' | 'negative' | 'neutral';
export interface FeedbackEntry {
    id: string;
    memory_id: string;
    signal: FeedbackSignal;
    context: string | null;
    created_at: string;
}
export interface Evidence {
    engram_id: string;
    quote: string;
    timestamp: string;
}
export interface Engram {
    id: string;
    version: number;
    layer: 'raw';
    status: Status;
    consolidated: boolean;
    consolidated_at?: string;
    type: MemoryType;
    memory_class: MemoryClass;
    polarity: Polarity;
    commitment: Commitment;
    scope: string;
    visibility: string;
    domain: string;
    tags: string[];
    statement: string;
    rationale: string;
    contraindications: string[];
    entities: Entity[];
    temporal: Temporal;
    source: Source;
    activation: Activation;
    emotional_weight: number;
    confidence: number;
    content_hash: string;
    associations: Association[];
    feedback: {
        positive: number;
        negative: number;
        neutral: number;
    };
    previous_version_ref: string | null;
    derivation_count: number;
}
export interface Observation {
    id: string;
    layer: 'observation';
    status: Status;
    scope: string;
    domain: string;
    tags: string[];
    title: string;
    statement: string;
    source_memory_ids: string[];
    proof_count: number;
    evidence: Evidence[];
    trend: 'new' | 'strengthening' | 'stable' | 'weakening' | 'stale';
    confidence: number;
    activation: Activation;
    emotional_weight: number;
    entities: Entity[];
    temporal: Temporal;
    history: Array<{
        event: string;
        at: string;
        from: string[];
    }>;
}
export interface MentalModel {
    id: string;
    layer: 'mental_model';
    status: Status;
    scope: string;
    domain: string;
    tags: string[];
    title: string;
    statement: string;
    source_observation_ids: string[];
    proof_count: number;
    confidence: number;
    trend: 'new' | 'strengthening' | 'stable' | 'weakening' | 'stale';
    refresh_policy: {
        cadence: string;
        stale_after_days: number;
    };
    last_refreshed: string;
    activation: Activation;
    emotional_weight: number;
    entities: Entity[];
    temporal: Temporal;
}
export interface Episode {
    id: string;
    timestamp: string;
    agent: string;
    channel: string;
    scope: string;
    summary: string;
    tags: string[];
    created_engram_ids: string[];
}
export interface GraphData {
    entities: Record<string, {
        type: string;
        memory_ids: string[];
    }>;
    edges: Array<{
        from: string;
        to: string;
        type: AssociationType;
        weight: number;
    }>;
}
export type Memory = Engram | Observation | MentalModel;
export interface ScoredResult {
    id: string;
    score: number;
}
export interface FlyupMemConfig {
    store_path: string;
    max_engrams_per_file: number;
    max_file_size_mb: number;
    decay_enabled: boolean;
    consolidation_enabled: boolean;
    embedding_enabled: boolean;
    log_level: 'debug' | 'info' | 'warn' | 'error';
}
export declare const DEFAULT_CONFIG: FlyupMemConfig;
//# sourceMappingURL=types.d.ts.map