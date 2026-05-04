# FlyupMem

Local-first memory for AI agents. FlyupMem stores human-editable memories in YAML, builds a rebuildable SQLite cache for search, and exposes the same memory store through a CLI, MCP server, OpenClaw plugin, and Hermes plugin boundary.

## What It Does

- Learns candidate memories from conversation turns.
- Recalls relevant memories as prompt-ready `<flyupmem-context>` blocks.
- Uses BM25/FTS search by default with zero model download.
- Optionally enables local semantic search through `@xenova/transformers`.
- Maintains decay, feedback, consolidation, graph links, curation, export/import, and sync tools.

## Install

```bash
npm install
npm run build
```

The package requires Node.js 20 or newer.

## Quick Start

Use a dedicated store while testing so you do not touch your real memory data:

```bash
export FLYUPMEM_STORE_PATH=/tmp/flyupmem-demo
npm run dev -- setup
npm run dev -- learn "记住：默认端口是 7897" "好的"
npm run dev -- recall "端口"
npm run dev -- status
```

Without `FLYUPMEM_STORE_PATH`, FlyupMem uses `~/.flyupmem`.

## CLI

```bash
flyupmem learn "<user message>" ["<assistant message>"]
flyupmem recall "<query>" [--explain]
flyupmem feedback <memory-id> <positive|negative|neutral>
flyupmem maintain
flyupmem doctor
flyupmem config show
flyupmem config set embedding_enabled true
flyupmem embed-init
```

`recall` is BM25-only by default. It does not download or initialize the embedding model unless `embedding_enabled` is true.

## MCP Server

After building:

```bash
flyupmem-mcp
```

Available MCP tools include:

- `flyup_learn`
- `flyup_recall`
- `flyup_feedback`
- `flyup_forget`
- `flyup_timeline`
- `flyup_status`
- `flyup_maintain`
- `flyup_reflect`
- `flyup_pack`
- `flyup_inspect`

## Semantic Search

Semantic search is optional because the first model load may need network access and can be slow.

```bash
flyupmem config set embedding_enabled true
flyupmem embed-init
```

If the model is unavailable, FlyupMem falls back to BM25-only search. Runtime initialization uses a short timeout and retry cooldown so startup and recall do not hang on a failed model download.

## Hermes Plugin

The Hermes adapter lives in `hermes-plugin/`.

Example local link:

```bash
ln -s <flyupmem>/hermes-plugin ~/.hermes/plugins/flyupmem
```

Run the boundary tests with:

```bash
npm run test:hermes-plugin
```

## Storage

The YAML store is the source of truth:

```text
~/.flyupmem/
  config.yaml
  engrams.yaml
  observations.yaml
  mental-models.yaml
  episodes.yaml
  graph.yaml
  feedback.yaml
  index.sqlite
```

SQLite is a rebuildable cache. If it is missing or invalid, FlyupMem can rebuild it from YAML.

## Current Concurrency Limit

YAML writes are atomic per file, but there is not yet a cross-process lock around the full read-modify-write cycle. Avoid running multiple writers against the same store at the exact same time. This matters when Hermes, MCP clients, and CLI maintenance all target the same `~/.flyupmem` directory.

## Development

```bash
npm run build
npm run test:ts
npm run test:hermes-plugin
```

The sync integration and benchmark tests are intentionally separate:

```bash
npm run test:sync
npm run test:benchmark
```
