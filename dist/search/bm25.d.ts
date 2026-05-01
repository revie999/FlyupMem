import type { ScoredResult } from '../core/types.js';
/**
 * Compute BM25 score for a single query-document pair.
 */
export declare function bm25Score(queryTokens: string[], docTokens: string[], avgDocLen: number, docCount: number, dfMap: Map<string, number>): number;
/**
 * BM25 search over a set of (id, text) entries.
 */
export declare function bm25Search(query: string, documents: Array<{
    id: string;
    text: string;
}>, limit?: number): ScoredResult[];
//# sourceMappingURL=bm25.d.ts.map