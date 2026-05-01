import { FlyupMemStore } from '../core/store.js';
import type { FlyupMemConfig } from '../core/types.js';
export interface OpenClawPluginConfig extends Partial<FlyupMemConfig> {
    origin?: string;
    autoLearn?: boolean;
    autoRecall?: boolean;
    autoDecay?: boolean;
    tokenBudget?: number;
}
export interface AssembleContext {
    query: string;
    sessionId?: string;
    scope?: string;
}
export interface TurnContext {
    sessionId?: string;
    scope?: string;
    agent?: string;
    channel?: string;
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
export declare class FlyupMemPlugin {
    private store;
    private config;
    private initialized;
    constructor(config?: OpenClawPluginConfig);
    /**
     * Get the underlying store (for advanced usage).
     */
    getStore(): FlyupMemStore;
    /**
     * onStartup: called once when the plugin loads.
     * Loads store, tries to init embedding model, runs initial maintenance.
     */
    onStartup(): Promise<void>;
    /**
     * onAssemble: called before each LLM turn.
     * Retrieves relevant memories and returns injection text.
     */
    onAssemble(ctx: AssembleContext): Promise<string>;
    /**
     * onAfterTurn: called after each LLM turn.
     * Extracts engrams from the conversation and learns them.
     */
    onAfterTurn(userMsg: string, assistantMsg: string, ctx?: TurnContext): Promise<void>;
    /**
     * onCompact: called before context compaction.
     * Extracts learnings from the session being compacted.
     */
    onCompact(messages: Array<{
        role: string;
        content: string;
    }>): Promise<void>;
    /**
     * onScheduled: called periodically (e.g. via cron/heartbeat).
     * Runs decay, consolidation, and graph maintenance.
     */
    onScheduled(): Promise<void>;
    /**
     * Learn a fact directly (not from conversation).
     */
    learn(statement: string, opts?: {
        type?: string;
        polarity?: string;
        scope?: string;
    }): import("../tools/flyup_learn.js").LearnResult;
    /**
     * Recall memories for a query.
     */
    recall(query: string, tokenBudget?: number): Promise<import("../tools/flyup_recall.js").RecallResult>;
    /**
     * Give feedback on a memory.
     */
    feedback(memoryId: string, signal: 'positive' | 'negative' | 'neutral', context?: string): import("../tools/flyup_feedback.js").FeedbackResult;
    /**
     * Get store status.
     */
    status(): any;
}
/**
 * Create a FlyupMem plugin instance.
 */
export declare function createFlyupMemPlugin(config?: OpenClawPluginConfig): FlyupMemPlugin;
//# sourceMappingURL=openclaw.d.ts.map