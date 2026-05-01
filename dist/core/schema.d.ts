import { z } from 'zod';
export declare const LayerSchema: z.ZodEnum<["mental_model", "observation", "raw", "experience"]>;
export declare const StatusSchema: z.ZodEnum<["candidate", "active", "fading", "dormant", "retired", "locked"]>;
export declare const MemoryTypeSchema: z.ZodEnum<["behavioral", "terminological", "procedural", "architectural"]>;
export declare const MemoryClassSchema: z.ZodEnum<["semantic", "episodic", "procedural", "metacognitive"]>;
export declare const PolaritySchema: z.ZodNullable<z.ZodEnum<["do", "dont"]>>;
export declare const CommitmentSchema: z.ZodEnum<["exploring", "leaning", "decided", "locked"]>;
export declare const TrendSchema: z.ZodEnum<["new", "strengthening", "stable", "weakening", "stale"]>;
export declare const FeedbackSignalSchema: z.ZodEnum<["positive", "negative", "neutral"]>;
export declare const AssociationTypeSchema: z.ZodEnum<["semantic", "temporal", "causal", "co_accessed", "entity", "evidence"]>;
export declare const ActivationSchema: z.ZodObject<{
    retrieval_strength: z.ZodNumber;
    storage_strength: z.ZodNumber;
    frequency: z.ZodNumber;
    last_accessed: z.ZodString;
}, "strip", z.ZodTypeAny, {
    retrieval_strength: number;
    storage_strength: number;
    frequency: number;
    last_accessed: string;
}, {
    retrieval_strength: number;
    storage_strength: number;
    frequency: number;
    last_accessed: string;
}>;
export declare const EntitySchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: string;
    name: string;
}, {
    type: string;
    name: string;
}>;
export declare const TemporalSchema: z.ZodObject<{
    learned_at: z.ZodString;
    valid_from: z.ZodString;
    valid_until: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    learned_at: string;
    valid_from: string;
    valid_until: string | null;
}, {
    learned_at: string;
    valid_from: string;
    valid_until: string | null;
}>;
export declare const SourceSchema: z.ZodObject<{
    episode_id: z.ZodNullable<z.ZodString>;
    quote: z.ZodString;
    origin: z.ZodString;
}, "strip", z.ZodTypeAny, {
    episode_id: string | null;
    quote: string;
    origin: string;
}, {
    episode_id: string | null;
    quote: string;
    origin: string;
}>;
export declare const AssociationSchema: z.ZodObject<{
    target: z.ZodString;
    type: z.ZodEnum<["semantic", "temporal", "causal", "co_accessed", "entity", "evidence"]>;
    weight: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
    target: string;
    weight: number;
}, {
    type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
    target: string;
    weight: number;
}>;
export declare const EvidenceSchema: z.ZodObject<{
    engram_id: z.ZodString;
    quote: z.ZodString;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    quote: string;
    engram_id: string;
    timestamp: string;
}, {
    quote: string;
    engram_id: string;
    timestamp: string;
}>;
export declare const EngramSchema: z.ZodObject<{
    id: z.ZodString;
    version: z.ZodNumber;
    layer: z.ZodLiteral<"raw">;
    status: z.ZodEnum<["candidate", "active", "fading", "dormant", "retired", "locked"]>;
    consolidated: z.ZodBoolean;
    consolidated_at: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["behavioral", "terminological", "procedural", "architectural"]>;
    memory_class: z.ZodEnum<["semantic", "episodic", "procedural", "metacognitive"]>;
    polarity: z.ZodNullable<z.ZodEnum<["do", "dont"]>>;
    commitment: z.ZodEnum<["exploring", "leaning", "decided", "locked"]>;
    scope: z.ZodString;
    visibility: z.ZodString;
    domain: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    statement: z.ZodString;
    rationale: z.ZodString;
    contraindications: z.ZodArray<z.ZodString, "many">;
    entities: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
    }, {
        type: string;
        name: string;
    }>, "many">;
    temporal: z.ZodObject<{
        learned_at: z.ZodString;
        valid_from: z.ZodString;
        valid_until: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }>;
    source: z.ZodObject<{
        episode_id: z.ZodNullable<z.ZodString>;
        quote: z.ZodString;
        origin: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        episode_id: string | null;
        quote: string;
        origin: string;
    }, {
        episode_id: string | null;
        quote: string;
        origin: string;
    }>;
    activation: z.ZodObject<{
        retrieval_strength: z.ZodNumber;
        storage_strength: z.ZodNumber;
        frequency: z.ZodNumber;
        last_accessed: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }>;
    emotional_weight: z.ZodNumber;
    confidence: z.ZodNumber;
    content_hash: z.ZodString;
    associations: z.ZodArray<z.ZodObject<{
        target: z.ZodString;
        type: z.ZodEnum<["semantic", "temporal", "causal", "co_accessed", "entity", "evidence"]>;
        weight: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        target: string;
        weight: number;
    }, {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        target: string;
        weight: number;
    }>, "many">;
    feedback: z.ZodObject<{
        positive: z.ZodNumber;
        negative: z.ZodNumber;
        neutral: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        positive: number;
        negative: number;
        neutral: number;
    }, {
        positive: number;
        negative: number;
        neutral: number;
    }>;
    previous_version_ref: z.ZodNullable<z.ZodString>;
    derivation_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    type: "behavioral" | "terminological" | "procedural" | "architectural";
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    version: number;
    layer: "raw";
    consolidated: boolean;
    memory_class: "procedural" | "semantic" | "episodic" | "metacognitive";
    polarity: "do" | "dont" | null;
    commitment: "locked" | "exploring" | "leaning" | "decided";
    scope: string;
    visibility: string;
    domain: string;
    tags: string[];
    statement: string;
    rationale: string;
    contraindications: string[];
    entities: {
        type: string;
        name: string;
    }[];
    source: {
        episode_id: string | null;
        quote: string;
        origin: string;
    };
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    content_hash: string;
    associations: {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        target: string;
        weight: number;
    }[];
    feedback: {
        positive: number;
        negative: number;
        neutral: number;
    };
    previous_version_ref: string | null;
    derivation_count: number;
    consolidated_at?: string | undefined;
}, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    type: "behavioral" | "terminological" | "procedural" | "architectural";
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    version: number;
    layer: "raw";
    consolidated: boolean;
    memory_class: "procedural" | "semantic" | "episodic" | "metacognitive";
    polarity: "do" | "dont" | null;
    commitment: "locked" | "exploring" | "leaning" | "decided";
    scope: string;
    visibility: string;
    domain: string;
    tags: string[];
    statement: string;
    rationale: string;
    contraindications: string[];
    entities: {
        type: string;
        name: string;
    }[];
    source: {
        episode_id: string | null;
        quote: string;
        origin: string;
    };
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    content_hash: string;
    associations: {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        target: string;
        weight: number;
    }[];
    feedback: {
        positive: number;
        negative: number;
        neutral: number;
    };
    previous_version_ref: string | null;
    derivation_count: number;
    consolidated_at?: string | undefined;
}>;
export declare const ObservationSchema: z.ZodObject<{
    id: z.ZodString;
    layer: z.ZodLiteral<"observation">;
    status: z.ZodEnum<["candidate", "active", "fading", "dormant", "retired", "locked"]>;
    scope: z.ZodString;
    domain: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    title: z.ZodString;
    statement: z.ZodString;
    source_memory_ids: z.ZodArray<z.ZodString, "many">;
    proof_count: z.ZodNumber;
    evidence: z.ZodArray<z.ZodObject<{
        engram_id: z.ZodString;
        quote: z.ZodString;
        timestamp: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        quote: string;
        engram_id: string;
        timestamp: string;
    }, {
        quote: string;
        engram_id: string;
        timestamp: string;
    }>, "many">;
    trend: z.ZodEnum<["new", "strengthening", "stable", "weakening", "stale"]>;
    confidence: z.ZodNumber;
    activation: z.ZodObject<{
        retrieval_strength: z.ZodNumber;
        storage_strength: z.ZodNumber;
        frequency: z.ZodNumber;
        last_accessed: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }>;
    emotional_weight: z.ZodNumber;
    entities: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
    }, {
        type: string;
        name: string;
    }>, "many">;
    temporal: z.ZodObject<{
        learned_at: z.ZodString;
        valid_from: z.ZodString;
        valid_until: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }>;
    history: z.ZodArray<z.ZodObject<{
        event: z.ZodString;
        at: z.ZodString;
        from: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        at: string;
        event: string;
        from: string[];
    }, {
        at: string;
        event: string;
        from: string[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    evidence: {
        quote: string;
        engram_id: string;
        timestamp: string;
    }[];
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    layer: "observation";
    scope: string;
    domain: string;
    tags: string[];
    statement: string;
    entities: {
        type: string;
        name: string;
    }[];
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    title: string;
    source_memory_ids: string[];
    proof_count: number;
    trend: "new" | "strengthening" | "stable" | "weakening" | "stale";
    history: {
        at: string;
        event: string;
        from: string[];
    }[];
}, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    evidence: {
        quote: string;
        engram_id: string;
        timestamp: string;
    }[];
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    layer: "observation";
    scope: string;
    domain: string;
    tags: string[];
    statement: string;
    entities: {
        type: string;
        name: string;
    }[];
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    title: string;
    source_memory_ids: string[];
    proof_count: number;
    trend: "new" | "strengthening" | "stable" | "weakening" | "stale";
    history: {
        at: string;
        event: string;
        from: string[];
    }[];
}>;
export declare const MentalModelSchema: z.ZodObject<{
    id: z.ZodString;
    layer: z.ZodLiteral<"mental_model">;
    status: z.ZodEnum<["candidate", "active", "fading", "dormant", "retired", "locked"]>;
    scope: z.ZodString;
    domain: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    title: z.ZodString;
    statement: z.ZodString;
    source_observation_ids: z.ZodArray<z.ZodString, "many">;
    proof_count: z.ZodNumber;
    confidence: z.ZodNumber;
    trend: z.ZodEnum<["new", "strengthening", "stable", "weakening", "stale"]>;
    refresh_policy: z.ZodObject<{
        cadence: z.ZodString;
        stale_after_days: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cadence: string;
        stale_after_days: number;
    }, {
        cadence: string;
        stale_after_days: number;
    }>;
    last_refreshed: z.ZodString;
    activation: z.ZodObject<{
        retrieval_strength: z.ZodNumber;
        storage_strength: z.ZodNumber;
        frequency: z.ZodNumber;
        last_accessed: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }>;
    emotional_weight: z.ZodNumber;
    entities: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
    }, {
        type: string;
        name: string;
    }>, "many">;
    temporal: z.ZodObject<{
        learned_at: z.ZodString;
        valid_from: z.ZodString;
        valid_until: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }>;
}, "strip", z.ZodTypeAny, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    layer: "mental_model";
    scope: string;
    domain: string;
    tags: string[];
    statement: string;
    entities: {
        type: string;
        name: string;
    }[];
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    title: string;
    proof_count: number;
    trend: "new" | "strengthening" | "stable" | "weakening" | "stale";
    source_observation_ids: string[];
    refresh_policy: {
        cadence: string;
        stale_after_days: number;
    };
    last_refreshed: string;
}, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    layer: "mental_model";
    scope: string;
    domain: string;
    tags: string[];
    statement: string;
    entities: {
        type: string;
        name: string;
    }[];
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    title: string;
    proof_count: number;
    trend: "new" | "strengthening" | "stable" | "weakening" | "stale";
    source_observation_ids: string[];
    refresh_policy: {
        cadence: string;
        stale_after_days: number;
    };
    last_refreshed: string;
}>;
export declare const EpisodeSchema: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodString;
    agent: z.ZodString;
    channel: z.ZodString;
    scope: z.ZodString;
    summary: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    created_engram_ids: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    timestamp: string;
    id: string;
    scope: string;
    tags: string[];
    agent: string;
    channel: string;
    summary: string;
    created_engram_ids: string[];
}, {
    timestamp: string;
    id: string;
    scope: string;
    tags: string[];
    agent: string;
    channel: string;
    summary: string;
    created_engram_ids: string[];
}>;
export declare const GraphDataSchema: z.ZodObject<{
    entities: z.ZodRecord<z.ZodString, z.ZodObject<{
        type: z.ZodString;
        memory_ids: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        type: string;
        memory_ids: string[];
    }, {
        type: string;
        memory_ids: string[];
    }>>;
    edges: z.ZodArray<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        type: z.ZodEnum<["semantic", "temporal", "causal", "co_accessed", "entity", "evidence"]>;
        weight: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        weight: number;
        from: string;
        to: string;
    }, {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        weight: number;
        from: string;
        to: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    entities: Record<string, {
        type: string;
        memory_ids: string[];
    }>;
    edges: {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        weight: number;
        from: string;
        to: string;
    }[];
}, {
    entities: Record<string, {
        type: string;
        memory_ids: string[];
    }>;
    edges: {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        weight: number;
        from: string;
        to: string;
    }[];
}>;
export declare const FeedbackEntrySchema: z.ZodObject<{
    id: z.ZodString;
    memory_id: z.ZodString;
    signal: z.ZodEnum<["positive", "negative", "neutral"]>;
    context: z.ZodNullable<z.ZodString>;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    memory_id: string;
    signal: "positive" | "negative" | "neutral";
    context: string | null;
    created_at: string;
}, {
    id: string;
    memory_id: string;
    signal: "positive" | "negative" | "neutral";
    context: string | null;
    created_at: string;
}>;
export declare const MemorySchema: z.ZodDiscriminatedUnion<"layer", [z.ZodObject<{
    id: z.ZodString;
    version: z.ZodNumber;
    layer: z.ZodLiteral<"raw">;
    status: z.ZodEnum<["candidate", "active", "fading", "dormant", "retired", "locked"]>;
    consolidated: z.ZodBoolean;
    consolidated_at: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["behavioral", "terminological", "procedural", "architectural"]>;
    memory_class: z.ZodEnum<["semantic", "episodic", "procedural", "metacognitive"]>;
    polarity: z.ZodNullable<z.ZodEnum<["do", "dont"]>>;
    commitment: z.ZodEnum<["exploring", "leaning", "decided", "locked"]>;
    scope: z.ZodString;
    visibility: z.ZodString;
    domain: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    statement: z.ZodString;
    rationale: z.ZodString;
    contraindications: z.ZodArray<z.ZodString, "many">;
    entities: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
    }, {
        type: string;
        name: string;
    }>, "many">;
    temporal: z.ZodObject<{
        learned_at: z.ZodString;
        valid_from: z.ZodString;
        valid_until: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }>;
    source: z.ZodObject<{
        episode_id: z.ZodNullable<z.ZodString>;
        quote: z.ZodString;
        origin: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        episode_id: string | null;
        quote: string;
        origin: string;
    }, {
        episode_id: string | null;
        quote: string;
        origin: string;
    }>;
    activation: z.ZodObject<{
        retrieval_strength: z.ZodNumber;
        storage_strength: z.ZodNumber;
        frequency: z.ZodNumber;
        last_accessed: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }>;
    emotional_weight: z.ZodNumber;
    confidence: z.ZodNumber;
    content_hash: z.ZodString;
    associations: z.ZodArray<z.ZodObject<{
        target: z.ZodString;
        type: z.ZodEnum<["semantic", "temporal", "causal", "co_accessed", "entity", "evidence"]>;
        weight: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        target: string;
        weight: number;
    }, {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        target: string;
        weight: number;
    }>, "many">;
    feedback: z.ZodObject<{
        positive: z.ZodNumber;
        negative: z.ZodNumber;
        neutral: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        positive: number;
        negative: number;
        neutral: number;
    }, {
        positive: number;
        negative: number;
        neutral: number;
    }>;
    previous_version_ref: z.ZodNullable<z.ZodString>;
    derivation_count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    type: "behavioral" | "terminological" | "procedural" | "architectural";
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    version: number;
    layer: "raw";
    consolidated: boolean;
    memory_class: "procedural" | "semantic" | "episodic" | "metacognitive";
    polarity: "do" | "dont" | null;
    commitment: "locked" | "exploring" | "leaning" | "decided";
    scope: string;
    visibility: string;
    domain: string;
    tags: string[];
    statement: string;
    rationale: string;
    contraindications: string[];
    entities: {
        type: string;
        name: string;
    }[];
    source: {
        episode_id: string | null;
        quote: string;
        origin: string;
    };
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    content_hash: string;
    associations: {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        target: string;
        weight: number;
    }[];
    feedback: {
        positive: number;
        negative: number;
        neutral: number;
    };
    previous_version_ref: string | null;
    derivation_count: number;
    consolidated_at?: string | undefined;
}, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    type: "behavioral" | "terminological" | "procedural" | "architectural";
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    version: number;
    layer: "raw";
    consolidated: boolean;
    memory_class: "procedural" | "semantic" | "episodic" | "metacognitive";
    polarity: "do" | "dont" | null;
    commitment: "locked" | "exploring" | "leaning" | "decided";
    scope: string;
    visibility: string;
    domain: string;
    tags: string[];
    statement: string;
    rationale: string;
    contraindications: string[];
    entities: {
        type: string;
        name: string;
    }[];
    source: {
        episode_id: string | null;
        quote: string;
        origin: string;
    };
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    content_hash: string;
    associations: {
        type: "semantic" | "temporal" | "causal" | "co_accessed" | "entity" | "evidence";
        target: string;
        weight: number;
    }[];
    feedback: {
        positive: number;
        negative: number;
        neutral: number;
    };
    previous_version_ref: string | null;
    derivation_count: number;
    consolidated_at?: string | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    layer: z.ZodLiteral<"observation">;
    status: z.ZodEnum<["candidate", "active", "fading", "dormant", "retired", "locked"]>;
    scope: z.ZodString;
    domain: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    title: z.ZodString;
    statement: z.ZodString;
    source_memory_ids: z.ZodArray<z.ZodString, "many">;
    proof_count: z.ZodNumber;
    evidence: z.ZodArray<z.ZodObject<{
        engram_id: z.ZodString;
        quote: z.ZodString;
        timestamp: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        quote: string;
        engram_id: string;
        timestamp: string;
    }, {
        quote: string;
        engram_id: string;
        timestamp: string;
    }>, "many">;
    trend: z.ZodEnum<["new", "strengthening", "stable", "weakening", "stale"]>;
    confidence: z.ZodNumber;
    activation: z.ZodObject<{
        retrieval_strength: z.ZodNumber;
        storage_strength: z.ZodNumber;
        frequency: z.ZodNumber;
        last_accessed: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }>;
    emotional_weight: z.ZodNumber;
    entities: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
    }, {
        type: string;
        name: string;
    }>, "many">;
    temporal: z.ZodObject<{
        learned_at: z.ZodString;
        valid_from: z.ZodString;
        valid_until: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }>;
    history: z.ZodArray<z.ZodObject<{
        event: z.ZodString;
        at: z.ZodString;
        from: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        at: string;
        event: string;
        from: string[];
    }, {
        at: string;
        event: string;
        from: string[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    evidence: {
        quote: string;
        engram_id: string;
        timestamp: string;
    }[];
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    layer: "observation";
    scope: string;
    domain: string;
    tags: string[];
    statement: string;
    entities: {
        type: string;
        name: string;
    }[];
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    title: string;
    source_memory_ids: string[];
    proof_count: number;
    trend: "new" | "strengthening" | "stable" | "weakening" | "stale";
    history: {
        at: string;
        event: string;
        from: string[];
    }[];
}, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    evidence: {
        quote: string;
        engram_id: string;
        timestamp: string;
    }[];
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    layer: "observation";
    scope: string;
    domain: string;
    tags: string[];
    statement: string;
    entities: {
        type: string;
        name: string;
    }[];
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    title: string;
    source_memory_ids: string[];
    proof_count: number;
    trend: "new" | "strengthening" | "stable" | "weakening" | "stale";
    history: {
        at: string;
        event: string;
        from: string[];
    }[];
}>, z.ZodObject<{
    id: z.ZodString;
    layer: z.ZodLiteral<"mental_model">;
    status: z.ZodEnum<["candidate", "active", "fading", "dormant", "retired", "locked"]>;
    scope: z.ZodString;
    domain: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    title: z.ZodString;
    statement: z.ZodString;
    source_observation_ids: z.ZodArray<z.ZodString, "many">;
    proof_count: z.ZodNumber;
    confidence: z.ZodNumber;
    trend: z.ZodEnum<["new", "strengthening", "stable", "weakening", "stale"]>;
    refresh_policy: z.ZodObject<{
        cadence: z.ZodString;
        stale_after_days: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cadence: string;
        stale_after_days: number;
    }, {
        cadence: string;
        stale_after_days: number;
    }>;
    last_refreshed: z.ZodString;
    activation: z.ZodObject<{
        retrieval_strength: z.ZodNumber;
        storage_strength: z.ZodNumber;
        frequency: z.ZodNumber;
        last_accessed: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }, {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    }>;
    emotional_weight: z.ZodNumber;
    entities: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        name: string;
    }, {
        type: string;
        name: string;
    }>, "many">;
    temporal: z.ZodObject<{
        learned_at: z.ZodString;
        valid_from: z.ZodString;
        valid_until: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }, {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    }>;
}, "strip", z.ZodTypeAny, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    layer: "mental_model";
    scope: string;
    domain: string;
    tags: string[];
    statement: string;
    entities: {
        type: string;
        name: string;
    }[];
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    title: string;
    proof_count: number;
    trend: "new" | "strengthening" | "stable" | "weakening" | "stale";
    source_observation_ids: string[];
    refresh_policy: {
        cadence: string;
        stale_after_days: number;
    };
    last_refreshed: string;
}, {
    temporal: {
        learned_at: string;
        valid_from: string;
        valid_until: string | null;
    };
    status: "candidate" | "active" | "fading" | "dormant" | "retired" | "locked";
    id: string;
    layer: "mental_model";
    scope: string;
    domain: string;
    tags: string[];
    statement: string;
    entities: {
        type: string;
        name: string;
    }[];
    activation: {
        retrieval_strength: number;
        storage_strength: number;
        frequency: number;
        last_accessed: string;
    };
    emotional_weight: number;
    confidence: number;
    title: string;
    proof_count: number;
    trend: "new" | "strengthening" | "stable" | "weakening" | "stale";
    source_observation_ids: string[];
    refresh_policy: {
        cadence: string;
        stale_after_days: number;
    };
    last_refreshed: string;
}>]>;
//# sourceMappingURL=schema.d.ts.map