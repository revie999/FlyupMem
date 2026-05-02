# Changelog

## Unreleased

### Added
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
