# Context — FlyupMem Domain Language

## Core Concepts

- **Engram (L3)** — A single learned fact extracted from conversation. The atomic unit of memory. Has content_hash for dedup, ACT-R activation, and scope.
- **Observation (L2)** — A pattern synthesized from ≥2 related Engrams via embedding clustering. Carries an evidence chain back to source Engrams.
- **Mental Model (L1)** — A high-level user/team model derived from ≥3 Observations. Injected as "Directives" (highest priority). Slowest decay.
- **Experience (L4)** — Raw interaction log. Fastest decay, rarely injected.
- **Episode** — A snapshot of a conversation turn. Links to created Engrams for provenance.

## Memory Lifecycle

- **candidate** → **active** — When proven by repetition (≥2), user confirmation, or assistant verification
- **active** → **fading** → **dormant** → **retired** — Driven by ACT-R decay based on access recency, frequency, and emotional weight
- **locked** — Never decays (user explicitly pinned)

## Retrieval Pipeline

- **BM25** — Keyword search with Chinese (Jieba) + English tokenization
- **Semantic** — Cosine similarity on BGE-small-zh-v1.5 embeddings (384-dim)
- **Graph** — Entity neighbor expansion + semantic/causal link traversal
- **Temporal** — Time-window matching + BFS diffusion along temporal/causal links
- **Activation** — ACT-R weighted by layer λ, emotional_weight, frequency, scope immunity
- **RRF** — Reciprocal Rank Fusion merges all signals
- **Local Rerank** — 8-dimensional scoring (relevance, specificity, activation, recency, evidence strength, confidence, scope, polarity)

## Storage

- **YAML** — Source of truth. Human-readable, git-trackable, manually editable.
- **SQLite** — Optional cache for FTS5 index and embedding vectors. Rebuildable from YAML.
- **Lockfile** — Prevents concurrent writes from multiple agents sharing `~/.flyupmem/`.

## Integration Points

- **OpenClaw** — Plugin hooks: `onAssemble`, `onAfterTurn`, `onCompact`, `onStartup`, `onScheduled`
- **Hermes** — MemoryProvider adapter (Python → TS core via CLI/MCP)
- **MCP** — `flyup_learn`, `flyup_recall`, `flyup_feedback`, `flyup_forget`, `flyup_timeline`, `flyup_status`
