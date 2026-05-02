# Changelog

## Unreleased

### Added
- Added Memory Curation CLI for local store quality maintenance:
  - `flyupmem review` finds likely dogfood/test/marker/low-value memory candidates.
  - `flyupmem prune` is dry-run by default.
  - `flyupmem prune --apply` safely retires candidates instead of deleting them, tags them `pruned`, and protects `locked` memories.
- Added tests and dist CLI dogfood coverage for review/prune workflows.
- Added Git Sync CLI MVP for YAML-first store portability:
  - `flyupmem sync init [remote]`
  - `flyupmem sync status`
  - `flyupmem sync push`
  - `flyupmem sync pull`
  - `flyupmem sync`
- Git Sync tracks source-of-truth YAML files and config, ignores derived SQLite/cache/temp files, and rebuilds SQLite after pull.
- Added `npm run test:sync` integration test suite for real Git repository workflows.

### Changed
- Default `npm test` now excludes long-running sync integration and benchmark suites; run them explicitly with `npm run test:sync` and `npm run test:benchmark`.
- Benchmark smoke suite reduced from 10K max to 5K/2.5K scale where needed to avoid Vitest worker RPC timeouts on synchronous SQLite workloads.

### Fixed
- Increased timeout for CLI `recall --explain` integration test to avoid false failures on cold `tsx` startup.
