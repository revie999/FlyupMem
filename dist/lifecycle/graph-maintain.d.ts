import type { Memory } from '../core/types.js';
import type { FlyupMemStore } from '../core/store.js';
/**
 * Update graph entities from a memory's entity list.
 */
export declare function updateGraphEntities(mem: Memory, store: FlyupMemStore): void;
/**
 * Create co-access edges between memories that share entities.
 */
export declare function createCoAccessEdges(mem: Memory, store: FlyupMemStore): void;
/**
 * Create temporal edges between memories learned close together.
 */
export declare function createTemporalEdges(mem: Memory, store: FlyupMemStore, windowHours?: number): void;
/**
 * Run full graph maintenance on a memory.
 */
export declare function maintainGraph(mem: Memory, store: FlyupMemStore): void;
/**
 * Run graph maintenance on all memories (bulk operation).
 */
export declare function maintainGraphBulk(store: FlyupMemStore): {
    processed: number;
};
//# sourceMappingURL=graph-maintain.d.ts.map