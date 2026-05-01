import type { Memory, ScoredResult } from '../core/types.js';
/**
 * 8-dimensional local rerank.
 * Takes a list of candidate memories with their relevance scores,
 * and re-ranks them using all 8 dimensions.
 */
export declare function localRerank(candidates: Array<{
    memory: Memory;
    relevanceScore: number;
}>, queryScope?: string | null): ScoredResult[];
//# sourceMappingURL=rerank.d.ts.map