import type { Memory, ScoredResult } from '../core/types.js';
/**
 * Check if semantic search is available (embedding model loaded).
 */
export declare function isSemanticAvailable(): boolean;
/**
 * Semantic search: find memories by cosine similarity of embeddings.
 * Returns empty if embedding model is unavailable.
 */
export declare function semanticSearch(query: string, memories: Memory[], limit?: number): Promise<ScoredResult[]>;
//# sourceMappingURL=semantic.d.ts.map