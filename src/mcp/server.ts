// src/mcp/server.ts — MCP Server for FlyupMem

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { FlyupMemStore } from '../core/store.js'
import { flyupLearn } from '../tools/flyup_learn.js'
import { flyupRecall } from '../tools/flyup_recall.js'
import { flyupFeedback } from '../tools/flyup_feedback.js'
import { flyupStatus } from '../tools/flyup_status.js'
import { flyupMaintain } from '../tools/flyup_maintain.js'
import { flyupReflect } from '../tools/flyup_reflect.js'
import { flyupPack } from '../tools/flyup_pack.js'
import { initEmbedder } from '../search/embed.js'

const store = new FlyupMemStore()

function createServer(): McpServer {
  const server = new McpServer({
    name: 'flyupmem',
    version: '0.4.0',
  })

  // ─── flyup_learn ────────────────────────────────────────────
  server.tool(
    'flyup_learn',
    'Learn a fact from conversation. Extracts knowledge, deduplicates, and stores as an engram.',
    {
      user_message: z.string().describe('The user message from the conversation'),
      assistant_message: z.string().optional().default('').describe('The assistant response'),
      origin: z.string().optional().default('mcp').describe('Origin identifier (e.g. mcp:claude)'),
    },
    async ({ user_message, assistant_message, origin }) => {
      store.load()
      const result = flyupLearn(user_message, assistant_message, store, origin)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )

  // ─── flyup_recall ───────────────────────────────────────────
  server.tool(
    'flyup_recall',
    'Search memories relevant to a query. Returns formatted context for injection into LLM prompts.',
    {
      query: z.string().describe('Search query'),
      token_budget: z.number().optional().default(2048).describe('Max tokens for injection'),
    },
    async ({ query, token_budget }) => {
      store.load()
      await initEmbedder()
      const result = await flyupRecall(query, store, token_budget)
      return {
        content: [{
          type: 'text' as const,
          text: result.injection || '<flyupmem-context>\n(no relevant memories found)\n</flyupmem-context>',
        }],
      }
    },
  )

  // ─── flyup_feedback ─────────────────────────────────────────
  server.tool(
    'flyup_feedback',
    'Give feedback on a memory (positive/negative/neutral). Negative feedback can trigger auto-retirement.',
    {
      memory_id: z.string().describe('Memory ID (e.g. ENG-20260501-001)'),
      signal: z.enum(['positive', 'negative', 'neutral']).describe('Feedback signal'),
      context: z.string().optional().describe('Optional context for the feedback'),
    },
    async ({ memory_id, signal, context }) => {
      store.load()
      const result = flyupFeedback(memory_id, signal, store, context)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )

  // ─── flyup_forget ───────────────────────────────────────────
  server.tool(
    'flyup_forget',
    'Retire a memory (soft delete). The memory is marked as retired but not removed.',
    {
      memory_id: z.string().describe('Memory ID to retire'),
      reason: z.string().optional().describe('Reason for forgetting'),
    },
    async ({ memory_id, reason }) => {
      store.load()
      const mem = store.getEngramById(memory_id)
      if (!mem) {
        return {
          content: [{ type: 'text' as const, text: `Memory ${memory_id} not found.` }],
        }
      }
      store.updateEngram(memory_id, { status: 'retired' })
      store.save()
      return {
        content: [{
          type: 'text' as const,
          text: `Memory ${memory_id} retired.${reason ? ` Reason: ${reason}` : ''}`,
        }],
      }
    },
  )

  // ─── flyup_timeline ─────────────────────────────────────────
  server.tool(
    'flyup_timeline',
    'Get recent episodes (conversation history snapshots).',
    {
      limit: z.number().optional().default(10).describe('Number of episodes to return'),
    },
    async ({ limit }) => {
      store.load()
      const episodes = store.episodes
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(episodes, null, 2),
        }],
      }
    },
  )

  // ─── flyup_status ───────────────────────────────────────────
  server.tool(
    'flyup_status',
    'Get memory store statistics and health check.',
    {},
    async () => {
      store.load()
      const result = flyupStatus(store)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )

  // ─── flyup_maintain ─────────────────────────────────────────
  server.tool(
    'flyup_maintain',
    'Run maintenance: batch decay, consolidation, graph updates.',
    {},
    async () => {
      store.load()
      const result = await flyupMaintain(store)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )

  // ─── flyup_reflect ──────────────────────────────────────────
  server.tool(
    'flyup_reflect',
    'Synthesize Mental Models from Observations using LLM (requires FLYUP_LLM_API_KEY).',
    {
      query: z.string().describe('Topic to synthesize a mental model about'),
    },
    async ({ query }) => {
      store.load()
      const result = await flyupReflect(query, store)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      }
    },
  )

  // ─── flyup_pack ─────────────────────────────────────────────
  server.tool(
    'flyup_pack',
    'Export or import a Knowledge Pack (YAML/JSON backup of all memories).',
    {
      action: z.enum(['export', 'import']).describe('Export or import'),
      file_path: z.string().describe('File path for export/import'),
    },
    async ({ action, file_path }) => {
      store.load()
      const result = flyupPack(action, file_path, store)
      return {
        content: [{
          type: 'text' as const,
          text: result.details,
        }],
      }
    },
  )

  return server
}

/**
 * Start the MCP server on stdio.
 */
export async function startMcpServer(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[FlyupMem MCP] Server started on stdio')
}

export { createServer }
