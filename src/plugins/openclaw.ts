// src/plugins/openclaw.ts — OpenClaw plugin for FlyupMem

import { FlyupMemStore } from '../core/store.js'
import { flyupLearn } from '../tools/flyup_learn.js'
import { flyupRecall } from '../tools/flyup_recall.js'
import { flyupFeedback } from '../tools/flyup_feedback.js'
import { flyupMaintain } from '../tools/flyup_maintain.js'
import { initEmbedder } from '../search/embed.js'
import { extractEngramsFromTurn } from '../lifecycle/extract.js'
import { contentHash } from '../core/hash.js'
import type { FlyupMemConfig } from '../core/types.js'

export interface OpenClawPluginConfig extends Partial<FlyupMemConfig> {
  origin?: string       // e.g. 'openclaw:webchat'
  autoLearn?: boolean   // auto-extract engrams after each turn (default true)
  autoRecall?: boolean  // auto-inject memories before each turn (default true)
  autoDecay?: boolean   // run batch decay on startup (default true)
  tokenBudget?: number  // injection token budget (default 2048)
}

export interface AssembleContext {
  query: string
  sessionId?: string
  scope?: string
}

export interface TurnContext {
  sessionId?: string
  scope?: string
  agent?: string
  channel?: string
}

/**
 * FlyupMem OpenClaw Plugin.
 *
 * Hooks into OpenClaw's lifecycle:
 * - onAssemble: inject relevant memories before LLM call
 * - onAfterTurn: extract and learn from conversation
 * - onCompact: extract learnings before context compaction
 * - onStartup: load store, init embedding, run maintenance
 * - onScheduled: periodic decay and consolidation
 */
export class FlyupMemPlugin {
  private store: FlyupMemStore
  private config: OpenClawPluginConfig
  private initialized = false

  constructor(config?: OpenClawPluginConfig) {
    this.config = {
      origin: 'openclaw:webchat',
      autoLearn: true,
      autoRecall: true,
      autoDecay: true,
      tokenBudget: 2048,
      ...config,
    }
    this.store = new FlyupMemStore(this.config)
  }

  /**
   * Get the underlying store (for advanced usage).
   */
  getStore(): FlyupMemStore {
    return this.store
  }

  // ─── Lifecycle hooks ────────────────────────────────────────

  /**
   * onStartup: called once when the plugin loads.
   * Loads store, tries to init embedding model, runs initial maintenance.
   */
  async onStartup(): Promise<void> {
    if (this.initialized) return

    this.store.load()

    // Best-effort embedding init (non-blocking if fails)
    try {
      await initEmbedder()
    } catch {
      // Embedding model not available, BM25-only mode
    }

    // Run initial maintenance if configured
    if (this.config.autoDecay) {
      try {
        await flyupMaintain(this.store)
      } catch {
        // Maintenance failure is non-fatal
      }
    }

    this.initialized = true
  }

  /**
   * onAssemble: called before each LLM turn.
   * Retrieves relevant memories and returns injection text.
   */
  async onAssemble(ctx: AssembleContext): Promise<string> {
    if (!this.config.autoRecall) return ''

    try {
      const result = await flyupRecall(
        ctx.query,
        this.store,
        this.config.tokenBudget,
      )
      return result.injection
    } catch {
      return ''
    }
  }

  /**
   * onAfterTurn: called after each LLM turn.
   * Extracts engrams from the conversation and learns them.
   */
  async onAfterTurn(userMsg: string, assistantMsg: string, ctx?: TurnContext): Promise<void> {
    if (!this.config.autoLearn) return

    try {
      flyupLearn(userMsg, assistantMsg, this.store, this.config.origin)

      // Update graph for newly created engrams
      const { maintainGraph } = await import('../lifecycle/graph-maintain.js')
      for (const eng of this.store.engrams.slice(-5)) { // last 5 new engrams
        maintainGraph(eng as any, this.store)
      }
    } catch {
      // Learning failure is non-fatal
    }
  }

  /**
   * onCompact: called before context compaction.
   * Extracts learnings from the session being compacted.
   */
  async onCompact(messages: Array<{ role: string; content: string }>): Promise<void> {
    try {
      // Extract from message pairs
      for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].role === 'user' && messages[i + 1]?.role === 'assistant') {
          flyupLearn(messages[i].content, messages[i + 1].content, this.store, this.config.origin)
        }
      }
    } catch {
      // Non-fatal
    }
  }

  /**
   * onScheduled: called periodically (e.g. via cron/heartbeat).
   * Runs decay, consolidation, and graph maintenance.
   */
  async onScheduled(): Promise<void> {
    try {
      await flyupMaintain(this.store)
    } catch {
      // Non-fatal
    }
  }

  // ─── Direct tool access ─────────────────────────────────────

  /**
   * Learn a fact directly (not from conversation).
   */
  learn(statement: string, opts?: { type?: string; polarity?: string; scope?: string }) {
    return flyupLearn(
      opts ? `${opts.polarity === 'dont' ? '不要' : '记住'}：${statement}` : statement,
      '',
      this.store,
      this.config.origin,
    )
  }

  /**
   * Recall memories for a query.
   */
  async recall(query: string, tokenBudget?: number) {
    return flyupRecall(query, this.store, tokenBudget ?? this.config.tokenBudget)
  }

  /**
   * Give feedback on a memory.
   */
  feedback(memoryId: string, signal: 'positive' | 'negative' | 'neutral', context?: string) {
    return flyupFeedback(memoryId, signal, this.store, context)
  }

  /**
   * Get store status.
   */
  status() {
    const { flyupStatus } = require('../tools/flyup_status.js')
    return flyupStatus(this.store)
  }
}

/**
 * Create a FlyupMem plugin instance.
 */
export function createFlyupMemPlugin(config?: OpenClawPluginConfig): FlyupMemPlugin {
  return new FlyupMemPlugin(config)
}
