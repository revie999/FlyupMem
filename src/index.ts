#!/usr/bin/env node
// src/index.ts — Entry point + CLI

import { FlyupMemStore } from './core/store.js'
import { flyupLearn } from './tools/flyup_learn.js'
import { flyupRecall, flyupRecallExplain } from './tools/flyup_recall.js'
import { flyupStatus } from './tools/flyup_status.js'
import { flyupFeedback } from './tools/flyup_feedback.js'
import { flyupMaintain } from './tools/flyup_maintain.js'
import { flyupReflect } from './tools/flyup_reflect.js'
import { flyupPack } from './tools/flyup_pack.js'
import { flyupDoctor } from './tools/flyup_doctor.js'
import { flyupSetup } from './tools/flyup_setup.js'
import { flyupInspect } from './tools/flyup_inspect.js'
import { configShow, configSet, configReset, configKeys } from './tools/flyup_config.js'
import { flyupSyncInit, flyupSyncStatus, flyupSyncPull, flyupSyncPush, flyupSync } from './tools/flyup_sync.js'
import { flyupReview, flyupPrune } from './tools/flyup_curate.js'
import { initEmbedder } from './search/embed.js'

// Re-export Phase 1-3
export { FlyupMemStore } from './core/store.js'
export { SQLiteCache } from './core/sqlite-cache.js'
export type { SQLiteCacheConfig, FTSResult, MetaRow } from './core/sqlite-cache.js'
export type * from './core/types.js'
export { flyupLearn, flyupRecall, flyupRecallExplain, flyupStatus, flyupFeedback, flyupMaintain }
export { flyupDoctor } from './tools/flyup_doctor.js'
export type { DoctorResult, DoctorCheck } from './tools/flyup_doctor.js'
export { flyupSetup } from './tools/flyup_setup.js'
export type { SetupResult, SetupStep } from './tools/flyup_setup.js'
export { flyupInspect } from './tools/flyup_inspect.js'
export type { InspectResult, MemoryDetail, RelatedMemory, GraphEdgeInfo, FeedbackSummary } from './tools/flyup_inspect.js'
export { configShow, configSet, configReset, configKeys } from './tools/flyup_config.js'
export type { ConfigResult } from './tools/flyup_config.js'
export { flyupSyncInit, flyupSyncStatus, flyupSyncPull, flyupSyncPush, flyupSync } from './tools/flyup_sync.js'
export type { ConflictStrategy } from './tools/flyup_sync.js'
export type { SyncInitResult, SyncStatusResult, SyncPullResult, SyncPushResult, SyncResult } from './tools/flyup_sync.js'
export { flyupReview, flyupPrune } from './tools/flyup_curate.js'
export type { ReviewResult, ReviewItem, ReviewOptions, PruneResult, PruneOptions } from './tools/flyup_curate.js'
export { unifiedRecall, recallWithExplanation, formatInjection } from './search/recall.js'
export { extractEngramsFromTurn } from './lifecycle/extract.js'
export { bm25Search } from './search/bm25.js'
export { tokenize } from './search/tokenize.js'
export { contentHash } from './core/hash.js'
export { generateId } from './core/id.js'
export { decayedStrength, computeActivation, reactivate, statusFromStrength } from './lifecycle/decay.js'
export { embed, embedBatch, cosineSimilarity, isEmbeddingAvailable, initEmbedder } from './search/embed.js'
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
export type { StatusResult } from './tools/flyup_status.js'
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
      const explain = args.includes('--explain') || args.includes('-x')
      if (explain) {
        const result = await flyupRecallExplain(query, store)
        console.log(JSON.stringify(result, null, 2))
      } else {
        const result = await flyupRecall(query, store)
        console.log(result.injection)
      }
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
      const ok = await initEmbedder({ timeoutMs: 0, forceRetry: true })
      console.log(ok ? '✓ Embedding model ready' : '✗ Embedding model unavailable')
      break
    }
    case 'doctor': {
      console.log('Running doctor checks...\n')
      const result = await flyupDoctor(store)
      for (const check of result.checks) {
        const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️ ' : '❌'
        console.log(`${icon} ${check.name}: ${check.message}`)
        if (check.details) {
          for (const d of check.details) console.log(`   └─ ${d}`)
        }
      }
      console.log(`\nOverall: ${result.overall}`)
      break
    }

    case 'setup': {
      const force = args.includes('--force')
      console.log('Setting up FlyupMem...\n')
      const result = flyupSetup(store, force)
      for (const step of result.steps) {
        const icon = step.status === 'ok' ? '✅' : step.status === 'skip' ? '⏭️ ' : '❌'
        console.log(`${icon} ${step.name}: ${step.message}`)
      }
      console.log(`\nSetup: ${result.ok ? 'complete ✅' : 'has failures ❌'}`)
      break
    }

    case 'inspect': {
      const memoryId = args[1]
      if (!memoryId) {
        console.error('Usage: flyupmem inspect <memory-id> [--json]')
        process.exit(1)
      }
      const result = flyupInspect(memoryId, store)
      if (!result.found) {
        console.error(result.error)
        process.exit(1)
      }
      if (args.includes('--json')) {
        console.log(JSON.stringify(result.memory, null, 2))
      } else {
        const m = result.memory!
        const act = m.activation
        console.log(`🔍 ${m.id}  (${m.layer} / ${m.status})`)
        console.log(`\n📄 Statement: ${m.statement}`)
        if (m.title) console.log(`📝 Title: ${m.title}`)
        if (m.type) console.log(`🏷  Type: ${m.type} | Class: ${m.memoryClass} | Polarity: ${m.polarity ?? 'null'}`)
        console.log(`\n📊 Activation`)
        console.log(`   retrieval_strength: ${act.retrievalStrength.toFixed(3)} → current: ${act.computedActivation.toFixed(3)}`)
        console.log(`   storage_strength:   ${act.storageStrength.toFixed(3)}`)
        console.log(`   frequency: ${act.frequency} | decay λ: ${act.effectiveDecay.toFixed(4)}`)
        console.log(`   layer: ${act.layer} (L${act.layerLevel})`)
        console.log(`\n⏰ Temporal`)
        console.log(`   learned:    ${m.learnedAt} (${m.ageDays.toFixed(1)}d ago)`)
        console.log(`   accessed:   ${m.lastAccessed} (${m.daysSinceAccess.toFixed(1)}d ago)`)
        console.log(`\n🎯 Meta: confidence=${m.confidence} emotional_weight=${m.emotionalWeight} scope=${m.scope} domain=${m.domain}`)
        if (m.tags.length) console.log(`🏷  Tags: ${m.tags.join(', ')}`)
        console.log(`📦 Hash: ${m.contentHash}`)
        if (m.related.length) {
          console.log(`\n🔗 Related (${m.related.length})`)
          for (const r of m.related) {
            console.log(`   → ${r.id} [${r.relationType} w=${r.weight}] ${r.statement.slice(0, 60)}`)
          }
        }
        if (m.graphEdges.length) {
          console.log(`\n🕸  Graph edges (${m.graphEdges.length})`)
          for (const e of m.graphEdges) {
            const arrow = e.direction === 'outgoing' ? '→' : '←'
            console.log(`   ${arrow} ${e.otherId} [${e.edgeType} w=${e.weight}]`)
          }
        }
        console.log(`\n💬 Feedback: +${m.feedback.positive} -${m.feedback.negative} ~${m.feedback.neutral}`)
      }
      break
    }

    case 'checkpoint': {
      const label = args[1]
      if (!label) {
        console.error('Usage: flyupmem checkpoint <label> [summary]')
        process.exit(1)
      }
      const summary = args.slice(2).join(' ') || label
      store.load()
      const episode = store.captureCheckpoint(label, { summary })
      store.save()
      console.log(JSON.stringify(episode, null, 2))
      break
    }

    case 'recover': {
      store.load()
      console.log(store.getRecoveryContext())
      break
    }

    case 'review': {
      const limitIdx = args.indexOf('--limit')
      const queryIdx = args.indexOf('--query')
      const result = flyupReview(store, {
        limit: limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined,
        query: queryIdx >= 0 ? args[queryIdx + 1] : undefined,
        includeRetired: args.includes('--include-retired'),
        batch: args.includes('--batch'),
      })
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'prune': {
      const ids = args.flatMap((arg, idx) => arg === '--id' && args[idx + 1] ? [args[idx + 1]] : [])
      const tagIdx = args.indexOf('--tag')
      const queryIdx = args.indexOf('--query')
      const result = flyupPrune(store, {
        apply: args.includes('--apply'),
        ids: ids.length ? ids : undefined,
        tag: tagIdx >= 0 ? args[tagIdx + 1] : undefined,
        query: queryIdx >= 0 ? args[queryIdx + 1] : undefined,
        all: args.includes('--all'),
        confirm: args.includes('--confirm'),
      })
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'config': {
      const sub = args[1]
      if (!sub || sub === 'show') {
        const result = configShow(store)
        console.log(JSON.stringify(result.config, null, 2))
      } else if (sub === 'set') {
        const key = args[2]
        const value = args[3]
        if (!key || !value) {
          console.error('Usage: flyupmem config set <key> <value>')
          process.exit(1)
        }
        const result = configSet(store, key, value)
        console.log(result.message)
        if (!result.changed) process.exit(1)
      } else if (sub === 'reset') {
        const result = configReset(store)
        console.log(result.message)
      } else if (sub === 'keys') {
        const keys = configKeys()
        for (const k of keys) {
          const def = k.values ? ` (${k.values.join('|')})` : ''
          console.log(`  ${k.key} [${k.type}]${def}`)
          console.log(`    ${k.description}`)
          console.log(`    default: ${JSON.stringify(k.default)}`)
        }
      } else {
        console.error(`Unknown config subcommand: ${sub}. Use: show | set | reset | keys`)
        process.exit(1)
      }
      break
    }

    case 'sync': {
      const sub = args[1]
      let result: unknown
      const hasForce = args.includes('--force')
      const strategyIdx = args.indexOf('--strategy')
      const strategy = strategyIdx >= 0 ? (args[strategyIdx + 1] as 'ff-only' | 'local-wins') : undefined
      if (!sub) {
        result = flyupSync(store)
      } else if (sub === 'init') {
        result = flyupSyncInit(store, args[2])
      } else if (sub === 'status') {
        result = flyupSyncStatus(store)
      } else if (sub === 'pull') {
        result = flyupSyncPull(store, strategy)
      } else if (sub === 'push') {
        result = flyupSyncPush(store, { force: hasForce })
      } else {
        console.error(`Unknown sync subcommand: ${sub}. Use: init | status | pull | push`)
        process.exit(1)
      }
      console.log(JSON.stringify(result, null, 2))
      if ((result as { ok?: boolean }).ok === false) process.exit(1)
      break
    }

    default:
      console.log(`FlyupMem v0.5.1 — Local-first memory for AI agents

Usage:
  flyupmem learn "<user message>" ["<assistant message>"]
  flyupmem recall "<query>" [--explain]
  flyupmem status
  flyupmem feedback <memory-id> <positive|negative|neutral>
  flyupmem maintain                          # Decay + consolidation + graph
  flyupmem reflect "<query>"                 # Synthesize Mental Models (needs LLM)
  flyupmem export [file.yaml]                # Export Knowledge Pack
  flyupmem import <file.yaml>                # Import Knowledge Pack
  flyupmem embed-init                        # Pre-load embedding model
  flyupmem doctor                            # Deep health check
  flyupmem setup [--force]                   # Environment check + store init
  flyupmem inspect <memory-id> [--json]      # Inspect memory detail & activation
  flyupmem checkpoint <label> [summary]      # Record a recovery checkpoint
  flyupmem recover                           # Print recent session/checkpoint context
  flyupmem review [--limit N] [--query q] [--batch] # Review low-value/test memory candidates (--batch: no limit)
  flyupmem prune [--apply] [--id ID|--tag T]        # Retire review candidates (dry-run by default)
  flyupmem prune --all                               # Batch retire all review candidates
  flyupmem prune --confirm                           # Retire with per-item detail output
  flyupmem config [show]                     # Show current config
  flyupmem config set <key> <value>          # Set config value
  flyupmem config reset                      # Reset to defaults
  flyupmem config keys                       # List available config keys
  flyupmem sync init [remote]                # Initialize Git sync for store
  flyupmem sync status                       # Show Git sync status
  flyupmem sync pull                         # Pull remote changes + rebuild cache
  flyupmem sync push                         # Commit YAML/config changes + push
  flyupmem sync                              # Pull then push

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
