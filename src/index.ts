// src/index.ts — Entry point + CLI

import { FlyupMemStore } from './core/store.js'
import { flyupLearn } from './tools/flyup_learn.js'
import { flyupRecall } from './tools/flyup_recall.js'
import { flyupStatus } from './tools/flyup_status.js'
import { initEmbedder } from './search/embed.js'

// Re-export all public API
export { FlyupMemStore } from './core/store.js'
export type * from './core/types.js'
export { flyupLearn, flyupRecall, flyupStatus }
export { unifiedRecall, formatInjection } from './search/recall.js'
export { extractEngramsFromTurn } from './lifecycle/extract.js'
export { bm25Search } from './search/bm25.js'
export { tokenize } from './search/tokenize.js'
export { contentHash } from './core/hash.js'
export { generateId } from './core/id.js'
export { decayedStrength, computeActivation, reactivate, statusFromStrength } from './lifecycle/decay.js'

// Phase 2 exports
export { embed, cosineSimilarity, isEmbeddingAvailable, initEmbedder } from './search/embed.js'
export { semanticSearch, isSemanticAvailable } from './search/semantic.js'
export { graphExpansion } from './search/graph.js'
export { temporalSearch, extractTimeReference } from './search/temporal.js'
export { rrfMerge } from './search/rrf.js'
export { localRerank } from './search/rerank.js'

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
      // Try to init embedding model (best effort)
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

    case 'embed-init': {
      console.log('Initializing embedding model...')
      const ok = await initEmbedder()
      console.log(ok ? '✓ Embedding model ready' : '✗ Embedding model unavailable')
      break
    }

    default:
      console.log(`FlyupMem v0.2.0 — Local-first memory for AI agents

Usage:
  flyupmem learn "<user message>" ["<assistant message>"]
  flyupmem recall "<query>"
  flyupmem status
  flyupmem embed-init          # Pre-load embedding model`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
