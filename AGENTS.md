# FlyupMem

Local-first, zero-cost memory plugin for AI agents. Supports OpenClaw plugin, Hermes MemoryProvider, and MCP server — all sharing the same `~/.flyupmem/` YAML store.

## Project structure

```
flyupmem/
├── src/              # TypeScript source
│   ├── core/         # Store, schema, YAML I/O, embedding
│   ├── search/       # BM25, semantic, graph, temporal, RRF, rerank
│   ├── lifecycle/    # Decay, consolidation, feedback, archival
│   ├── plugins/      # OpenClaw plugin, Hermes adapter
│   └── mcp/          # MCP server
├── tests/            # Vitest tests
├── docs/             # Documentation
│   ├── adr/          # Architecture Decision Records
│   └── agents/       # Agent skill configuration
├── AGENTS.md         # This file
├── CONTEXT.md        # Domain language and concepts
└── DESIGN.md         # Full design document
```

## Key conventions

- **Language:** TypeScript (Node.js 20+)
- **Test framework:** Vitest
- **Store:** YAML-first, SQLite as optional cache
- **Embeddings:** BGE-small-zh-v1.5 ONNX (local, zero cost)
- **Memory root:** `~/.flyupmem/`

## Agent skills

### Issue tracker

GitHub Issues at `revie999/FlyupMem`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default 5-label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at project root. See `docs/agents/domain.md`.
