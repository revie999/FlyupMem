import type { ScoredResult, GraphData, Memory } from '../core/types.js';
/**
 * Graph expansion: from seed memories, follow entity and semantic/causal links.
 */
export declare function graphExpansion(seedIds: string[], memories: Memory[], graph: GraphData, limit?: number): ScoredResult[];
//# sourceMappingURL=graph.d.ts.map