# Phase 1 Implementation Plan — FlyupMem MVP

## Goal
Build a working memory system with YAML storage, BM25 search, ACT-R decay, and basic tool interface.

## Architecture

```
src/
├── core/
│   ├── types.ts          # TypeScript interfaces (Engram, Observation, MentalModel, Episode, Graph, Feedback)
│   ├── store.ts          # FlyupMemStore — YAML read/write, lockfile, atomic writes
│   ├── schema.ts         # Zod schemas for validation
│   ├── hash.ts           # content_hash (SHA-256 dedup)
│   └── id.ts             # ID generation (ENG-YYYYMMDD-NNN, OBS-, MM-, EP-)
├── search/
│   ├── tokenize.ts       # Chinese (trigram) + English tokenization
│   ├── bm25.ts           # BM25 scoring (K1=1.2, B=0.75)
│   └── recall.ts         # unifiedRecall — single-signal (BM25 only in Phase 1)
├── lifecycle/
│   ├── decay.ts          # ACT-R decay with layer-based λ + emotional_weight
│   ├── extract.ts        # Rule-based engram extraction from conversation
│   └── dedup.ts          # content_hash dedup + high-similarity merge
├── tools/
│   ├── flyup_learn.ts    # Learn from conversation
│   ├── flyup_recall.ts   # Search memories
│   └── flyup_status.ts   # Memory statistics
└── index.ts              # Entry point + CLI
```

## Step-by-step

### S1: Project setup
- package.json (typescript, vitest, better-sqlite3, js-yaml, zod)
- tsconfig.json
- vitest.config.ts
- Basic test infrastructure

### S2: Core types + Zod schemas
- All interfaces: Engram, Observation, MentalModel, Episode, Graph, Feedback
- Zod schemas for runtime validation
- ID generation helpers

### S3: Store — YAML read/write
- atomicWrite (tmp + rename)
- lockfile (proper-lockfile or manual)
- load/save for each YAML file
- Health check

### S4: Content hash + dedup
- SHA-256 of normalized statement
- Dedup on learn: exact match → skip + bump frequency

### S5: ACT-R decay
- Layer-based λ (L1=0.01, L2=0.025, L3=0.05, L4=0.08)
- emotional_weight modulation
- statusFromStrength
- batchDecay()

### S6: Rule-based extraction
- Pattern matching for user corrections, preferences, decisions, tool tips
- Extract engrams from (user, assistant) turn pairs

### S7: BM25 search
- tokenize (trigram for Chinese, word split for English)
- BM25 scoring
- search function returning ranked results

### S8: Recall — unified pipeline (Phase 1 = BM25 only)
- unifiedRecall wrapping BM25
- Token budget trimming
- Format injection (Directives / Constraints / Consider)

### S9: Tools — learn, recall, status
- flyup_learn: extract → dedup → store
- flyup_recall: search → inject
- flyup_status: count by layer, status breakdown

### S10: CLI entry point + basic tests
- CLI commands: learn, recall, status
- Unit tests for each module
- Integration test: learn → recall roundtrip

## Verification
- `npm test` — all unit tests pass
- `npx tsx src/index.ts learn "用户说: 以后用 toMatchObject 不用 toEqual"` — stores engram
- `npx tsx src/index.ts recall "Vitest 匹配"` — retrieves it
- `npx tsx src/index.ts status` — shows counts
