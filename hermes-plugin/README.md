# FlyupMem Hermes Plugin

Hermes MemoryProvider adapter for FlyupMem. Connects Hermes Agent to the FlyupMem persistent memory system.

## Installation

1. Install the FlyupMem CLI:
   ```bash
   cd ~/projects/flyupmem && npm link
   ```

2. Copy/symlink the plugin into Hermes:
   ```bash
   ln -s ~/projects/flyupmem/hermes-plugin ~/.hermes/hermes-agent/plugins/memory/flyupmem
   ```

3. Activate in Hermes config:
   ```yaml
   memory:
     provider: flyupmem
   ```

4. Restart Hermes gateway:
   ```bash
   hermes gateway restart
   ```

## How it works

The adapter implements Hermes's `MemoryProvider` interface and delegates all operations to the `flyupmem` CLI:

- **prefetch()** — Background recall before each turn (cached)
- **sync_turn()** — Learn from conversation after each turn (async)
- **handle_tool_call()** — Dispatch flyup_recall/learn/feedback/status tools
- **on_session_end()** — Extract learnings and run maintenance
- **on_pre_compress()** — Preserve insights before context compression

## Shared storage

All FlyupMem interfaces (CLI, MCP server, OpenClaw plugin, Hermes adapter) share the same `~/.flyupmem/` YAML store. Memories learned via any interface are immediately available to all others.

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `FLYUPMEM_STORE_PATH` | `~/.flyupmem` | Store directory |
| `FLYUPMEM_TOKEN_BUDGET` | `2048` | Injection token budget |
