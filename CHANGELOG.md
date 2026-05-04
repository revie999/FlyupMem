# Changelog

## Unreleased

### Added

- Added automatic Engram YAML archive splitting:
  - `engrams.yaml` now keeps only the newest/hot tail capped by `max_engrams_per_file` (default `5000`).
  - Older engrams are written to numbered chunks under `engrams.d/engrams-000001.yaml`, `engrams-000002.yaml`, etc.
  - Existing single-file stores remain readable; chunked stores load archive chunks plus `engrams.yaml`.
  - Unchanged archive chunk files are not rewritten on subsequent saves, reducing long-term YAML write pressure.
- Added Benchmark CLI for local performance baselines:
  - `flyupmem benchmark --counts 1000,5000,10000 --iterations 3 --format markdown --out file`.
  - JSON/Markdown output modes for automation and human review.
  - Measures population, YAML save/load, SQLite cache rebuild, FTS search, in-memory BM25 fallback, full recall pipeline, hit count, and store sizes.
  - Exports benchmark helper APIs for tests and external automation.
- Added Incremental Sync with Smart Debounce:
  - `flyupSyncPush` now only stages files that actually changed (`addChangedFiles` replaces `addTrackedFiles`).
  - New `stagedFiles` field in `SyncPushResult` shows which files were committed.
  - Debounce: skips commit if last commit was < 5 seconds ago (configurable via `debounceMs`).
  - `--force` flag bypasses debounce for urgent syncs.
- Added Conflict Resolution (local-wins strategy):
  - `flyupSyncPull` accepts `strategy` parameter: `'ff-only'` (default) or `'local-wins'`.
  - `local-wins`: on divergent histories, resets to remote then cherry-picks local commits, resolving conflicts by keeping local version.
  - CLI: `flyupmem sync pull --strategy local-wins`.
- Added Batch Operations for memory curation:
  - `review --batch`: removes the default 50-item limit, returns all review candidates.
  - `prune --all`: batch retires all review candidates in one pass (implies --apply).
  - `prune --confirm`: retires candidates with per-item detail output (id, statement, action, reason).
- Added Adoption-Based Scoring:
  - New `adoption_count` field on Engram tracks how many times positive feedback was given.
  - `applyFeedback` automatically increments `adoption_count` on positive signal only.
  - `computeQualityScore` now factors in adoption count (log-scaled, capped at +0.20).
  - Reranker passes `adoption_count` to quality dimension.
  - Zod schema `adoption_count` with `.default(0)` for backward compatibility.
- Added Memory Quality Scoring with 9-dimension rerank pipeline:
  - New `turn_count` field in Activation tracks how many conversation turns recalled each memory.
  - `computeActivation` now includes log-scaled turn_count boost (capped at +0.15).
  - New `computeQualityScore` function: factors in turn_count, decay ratio, consolidation status, and feedback balance.
  - 9th rerank dimension `quality` (weight 0.18) replaces previous 8-dim weights.
  - `recallWithExplanation` automatically increments `turn_count` and persists via `store.save()`.
- Added Memory Curation CLI for local store quality maintenance:
  - `flyupmem review` finds likely dogfood/test/marker/low-value memory candidates.
  - `flyupmem prune` is dry-run by default.
  - `flyupmem prune --apply` safely retires candidates instead of deleting them, tags them `pruned`, and protects `locked` memories.
- Added tests and dist CLI dogfood coverage for review/prune workflows.
- Review now flags low-context engineering fragments from debugging/review sessions, e.g. terse `persistence`/`mutate`/`benchmark` leftovers that are not useful long-term memories.
- Review now scans all memory layers (`Engram`, `Observation`, `MentalModel`) and can retire matched non-Engram memories via the layer-specific update APIs.
- Review now flags malformed extraction artifacts and low-context conversational fragments found during real-store recall audits, e.g. broken `记住：..." "好的）"` captures and bare replies like `别的账号呢`.
- Added Git Sync CLI MVP for YAML-first store portability:
  - `flyupmem sync init [remote]`
  - `flyupmem sync status`
  - `flyupmem sync push`
  - `flyupmem sync pull`
  - `flyupmem sync`
- Git Sync tracks source-of-truth YAML files and config, ignores derived SQLite/cache/temp files, and rebuilds SQLite after pull.
- Added `npm run test:sync` integration test suite for real Git repository workflows.

### Changed
- Recall activation persistence is now write-light by default:
  - New config `recall_activation_persistence` supports `sqlite` (default), `yaml`, and `off`.
  - Default `sqlite` mode updates only SQLite activation metadata during recall and avoids rewriting large YAML source files on every read.
  - `yaml` mode preserves the previous fully durable behavior for users who want ACT-R counters persisted to YAML immediately.
- `FlyupMemStore` now loads persisted `config.yaml` during construction, so `flyupmem config set ...` affects fresh runtime stores, not just `config show`.
- `withWriteLock()` opens SQLite before write mutations so cache sync paths work outside explicit `store.load()` calls.
- Default `npm test` now excludes long-running sync integration and benchmark suites; run them explicitly with `npm run test:sync` and `npm run test:benchmark`.
- Benchmark smoke suite reduced from 10K max to 5K/2.5K scale where needed to avoid Vitest worker RPC timeouts on synchronous SQLite workloads.

### Fixed
- Increased timeout for CLI `recall --explain` integration test to avoid false failures on cold `tsx` startup.
