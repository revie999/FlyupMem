import type { Memory } from '../core/types.js';
import type { FlyupMemStore } from '../core/store.js';
/**
 * Format memories into injection text with priority sections.
 */
export declare function formatInjection(memories: Memory[]): string;
/**
 * Unified recall: multi-signal retrieval with RRF fusion + ACT-R activation + 8-dim rerank.
 *
 * Signals (in parallel where possible):
 * 1. BM25 — keyword matching
 * 2. Semantic — embedding similarity (if model available)
 * 3. Graph — entity + link expansion (from BM25 seeds)
 * 4. Temporal — time-window + BFS diffusion
 * 5. Activation — ACT-R decay model
 *
 * Pipeline:
 * BM25 + Semantic + Temporal (parallel) → Graph (from BM25 seeds) → RRF fusion → ACT-R weighting → Rerank → Token trim
 */
export declare function unifiedRecall(query: string, store: FlyupMemStore, tokenBudget?: number, queryScope?: string | null): Promise<{
    memories: Memory[];
    injection: string;
}>;
//# sourceMappingURL=recall.d.ts.map