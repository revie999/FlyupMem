import type { ScoredResult, Memory, GraphData } from '../core/types.js';
/**
 * Extract a time reference from a query string.
 * Looks for dates, "today", "yesterday", "last week", etc.
 */
export declare function extractTimeReference(query: string): string | null;
/**
 * Temporal search: time-window matching + BFS diffusion along temporal/causal links.
 */
export declare function temporalSearch(query: string, memories: Memory[], graph: GraphData, queryTimeRef?: string | null, limit?: number): ScoredResult[];
//# sourceMappingURL=temporal.d.ts.map