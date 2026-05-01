import type { Engram } from '../core/types.js';
import type { FlyupMemStore } from '../core/store.js';
/**
 * Result of deduplication check.
 */
export interface DedupResult {
    action: 'ADD' | 'SKIP' | 'UPDATE';
    existingId?: string;
    reason?: string;
}
/**
 * Check if a new engram is a duplicate or should be merged.
 */
export declare function deduplicate(newStatement: string, store: FlyupMemStore): DedupResult;
/**
 * Apply dedup result: if SKIP, bump frequency; if ADD, store the engram.
 */
export declare function applyDedup(engram: Engram, store: FlyupMemStore): DedupResult;
//# sourceMappingURL=dedup.d.ts.map