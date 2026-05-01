#!/usr/bin/env node
// src/mcp/entry.ts — MCP server entry point
import { startMcpServer } from './server.js';
startMcpServer().catch(err => {
    console.error('[FlyupMem MCP] Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=entry.js.map