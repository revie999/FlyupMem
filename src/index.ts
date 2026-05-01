// src/index.ts — Entry point + CLI

import { FlyupMemStore } from './core/store.js'
import { flyupLearn } from './tools/flyup_learn.js'
import { flyupRecall } from './tools/flyup_recall.js'
import { flyupStatus } from './tools/flyup_status.js'

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
      const result = await flyupRecall(query, store)
      console.log(result.injection)
      break
    }

    case 'status': {
      const result = flyupStatus(store)
      console.log(JSON.stringify(result, null, 2))
      break
    }

    default:
      console.log(`FlyupMem v0.1.0 — Local-first memory for AI agents

Usage:
  flyupmem learn "<user message>" ["<assistant message>"]
  flyupmem recall "<query>"
  flyupmem status`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
