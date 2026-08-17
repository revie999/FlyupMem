# Contributing to FlyupMem

Thanks for helping improve FlyupMem. The project aims to keep AI-agent memory
local-first, inspectable, and recoverable.

## Before opening an issue

- Check existing issues and the README first.
- Include the FlyupMem version, Node.js version, operating system, and a minimal
  reproduction when reporting a defect.
- Do not include real memory contents, API keys, tokens, or other sensitive data.

## Development setup

```bash
npm install
npm run build
npm run test:ts
npm run test:hermes-plugin
```

Run the longer suites separately when your change affects those paths:

```bash
npm run test:sync
npm run test:benchmark
```

## Pull requests

- Keep each pull request focused on one behavior change.
- Add or update tests for behavior changes.
- Preserve YAML as the source of truth; SQLite is a rebuildable cache.
- Treat migrations and repair paths as conservative operations: default to
  previewable, reversible behavior and preserve user data.
- Describe user-visible changes and verification steps in the pull request body.

## Areas where contributions help

- Agent framework integrations and MCP compatibility
- Retrieval relevance and memory-quality evaluation
- Store migration, recovery, and concurrency coverage
- Documentation, examples, and reproducible benchmarks
