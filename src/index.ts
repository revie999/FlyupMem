// src/index.ts — Entry point + CLI

import { FlyupMemStore } from './core/store.js'
import { flyupLearn } from './tools/flyup_learn.js'
import { flyupRecall } from './tools/flyup_recall.js'
import { flyupStatus } from './tools/flyup_status.js'
import { flyupFeedback } from './tools/flyup_feedback.js'
import { flyupMaintain } from './tools/flyup_maintain.js'
import { initEmbedder } from './search/embed.js'

// Re-export Phase 1 + 2
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
export { embed, cosineSimilarity, isEmbeddingAvailable, initEmbedder } from './search/embed.js'
export { semanticSearch, isSemanticAvailable } from './search/semantic.js'
export { graphExpansion } from './search/graph.js'
export { temporalSearch, extractTimeReference } from './search/temporal.js'
export { rrfMerge } from './search/rrf.js'
export { localRerank } from './search/rerank.js'

// Re-export Phase 3
export { flyupFeedback } from './tools/flyup_feedback.js'
export { flyupMaintain } from './tools/flyup_maintain.js'
export { applyFeedback, getFeedbackSummary } from './lifecycle/feedback.js'
export { batchDecay } from './lifecycle/batch-decay.js'
export { consolidateUnmerged, clusterByEmbedding, mergeToObservation } from './lifecycle/consolidate.js'
export { maintainGraph, maintainGraphBulk } from './lifecycle/graph-maintain.js'

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

    case 'embed-init': {
      console.log('Initializing embedding model...')
      const ok = await initEmbedder()
      console.log(ok ? '✓ Embedding model ready' : '✗ Embedding model unavailable')
      break
    }

    default:
      console.log(`FlyupMem v0.3.0 — Local-first memory for AI agents

Usage:
  flyupmem learn "<user message>" ["<assistant message>"]
  flyupmem recall "<query>"
  flyupmem status
  flyupmem feedback <memory-id> <positive|negative|neutral>
  flyupmem maintain                    # Run decay + consolidation + graph maintenance
  flyupmem embed-init                  # Pre-load embedding model`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
