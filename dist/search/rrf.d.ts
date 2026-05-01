import type { ScoredResult } from '../core/types.js';
/**
 * RRF (Reciprocal Rank Fusion): merge multiple ranked lists into one.
 * Formula: score(d) = Σ 1/(k + rank_i(d))
 *
 * @param resultLists - Array of ranked result lists from different retrieval signals
 * @param k - Smoothing constant (default 60, standard in literature)
 */
export declare function rrfMerge(resultLists: ScoredResult[][], k?: number): ScoredResult[];
//# sourceMappingURL=rrf.d.ts.map