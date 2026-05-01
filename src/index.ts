// src/index.ts — Entry point + CLI

import { FlyupMemStore } from './core/store.js'
import { flyupLearn } from './tools/flyup_learn.js'
import { flyupRecall } from './tools/flyup_recall.js'
import { flyupStatus } from './tools/flyup_status.js'
import { flyupFeedback } from './tools/flyup_feedback.js'
import { flyupMaintain } from './tools/flyup_maintain.js'
import { flyupReflect } from './tools/flyup_reflect.js'
import { flyupPack } from './tools/flyup_pack.js'
import { initEmbedder } from './search/embed.js'

// Re-export Phase 1-3
export { FlyupMemStore } from './core/store.js'
export type * from './core/types.js'
export { flyupLearn, flyupRecall, flyupStatus, flyupFeedback, flyupMaintain }
export { unifiedRecall, formatInjection } from './search/recall.js'
export { extractEngramsFromTurn } from './lifecycle/extract.js'
export { bm25Search } from './search/bm25.js'
export { tokenize } from './search/tokenize.js'
export { contentHash } from './core/hash.js'
export { generateId } from './core/id.js'
export { decayedStrength, computeActivation, reactivate, statusFromStrength } from './lifecycle/decay.js'
export { embed, cosineSimilarity, isEmbeddingAvailable, initEmbedder } from './search/embed.js'
export { semanticSearch, isSemanticAvailable } from './search/semantic.js'
export { graphExpansion } from './search/graph.js'
export { temporalSearch, extractTimeReference } from './search/temporal.js'
export { rrfMerge } from './search/rrf.js'
export { localRerank } from './search/rerank.js'
export { applyFeedback, getFeedbackSummary } from './lifecycle/feedback.js'
export { batchDecay } from './lifecycle/batch-decay.js'
export { consolidateUnmerged, clusterByEmbedding, mergeToObservation } from './lifecycle/consolidate.js'
export { maintainGraph, maintainGraphBulk } from './lifecycle/graph-maintain.js'

// Re-export Phase 5 — Plugins
export { FlyupMemPlugin, createFlyupMemPlugin } from './plugins/openclaw.js'
export type { OpenClawPluginConfig, AssembleContext, TurnContext } from './plugins/openclaw.js'
export { createServer, startMcpServer } from './mcp/server.js'
export { flyupReflect } from './tools/flyup_reflect.js'
export { flyupPack } from './tools/flyup_pack.js'
export { LLMClient, createLLMClient } from './enhance/llm-client.js'
export type { LLMConfig, LLMMessage, LLMResponse } from './enhance/llm-client.js'
export { extractEngramsLLM } from './enhance/extract-llm.js'
export { reflect } from './enhance/reflect.js'
export { exportKnowledgePack, importKnowledgePack, exportKnowledgePackToFile, importKnowledgePackFromFile } from './enhance/knowledge-pack.js'

// ─── CLI ──────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  const store = new FlyupMemStore()

  switch (command) {
    case 'learn': {
      const userMsg = args[1]
      const assistantMsg = args[2] ?? ''
      if (!userMsg) {
        console.error('Usage: flyupmem learn "<user message>" ["<assistant message>"]')
        process.exit(1)
      }
      const result = flyupLearn(userMsg, assistantMsg, store)
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'recall': {
      const query = args[1]
      if (!query) {
        console.error('Usage: flyupmem recall "<query>"')
        process.exit(1)
      }
      await initEmbedder()
      const result = await flyupRecall(query, store)
      console.log(result.injection)
      break
    }

    case 'status': {
      const result = flyupStatus(store)
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'feedback': {
      const memoryId = args[1]
      const signal = args[2] as 'positive' | 'negative' | 'neutral'
      if (!memoryId || !signal) {
        console.error('Usage: flyupmem feedback <memory-id> <positive|negative|neutral>')
        process.exit(1)
      }
      const result = flyupFeedback(memoryId, signal, store)
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'maintain': {
      console.log('Running maintenance...')
      const result = await flyupMaintain(store)
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'reflect': {
      const query = args[1]
      if (!query) {
        console.error('Usage: flyupmem reflect "<query>"')
        process.exit(1)
      }
      const result = await flyupReflect(query, store)
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'export': {
      const filePath = args[1] ?? 'flyupmem-export.yaml'
      const result = flyupPack('export', filePath, store)
      console.log(result.details)
      break
    }

    case 'import': {
      const filePath = args[1]
      if (!filePath) {
        console.error('Usage: flyupmem import <file.yaml|file.json>')
        process.exit(1)
      }
      const result = flyupPack('import', filePath, store)
      console.log(result.details)
      break
    }

    case 'embed-init': {
      console.log('Initializing embedding model...')
      const ok = await initEmbedder()
      console.log(ok ? '✓ Embedding model ready' : '✗ Embedding model unavailable')
      break
    }

    default:
      console.log(`FlyupMem v0.4.0 — Local-first memory for AI agents

Usage:
  flyupmem learn "<user message>" ["<assistant message>"]
  flyupmem recall "<query>"
  flyupmem status
  flyupmem feedback <memory-id> <positive|negative|neutral>
  flyupmem maintain                          # Decay + consolidation + graph
  flyupmem reflect "<query>"                 # Synthesize Mental Models (needs LLM)
  flyupmem export [file.yaml]                # Export Knowledge Pack
  flyupmem import <file.yaml>                # Import Knowledge Pack
  flyupmem embed-init                        # Pre-load embedding model

Environment:
  FLYUP_LLM_API_KEY     LLM API key (for reflect/LLM extraction)
  FLYUP_LLM_BASE_URL    LLM endpoint (default: https://api.openai.com/v1)
  FLYUP_LLM_MODEL       Model name (default: gpt-4o-mini)`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
