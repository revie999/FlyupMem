import type { Status } from '../core/types.js';
import type { FlyupMemStore } from '../core/store.js';
/**
 * Apply decay to all memories in the store.
 * Updates retrieval_strength and status based on time since last access.
 * Skips locked memories.
 */
export declare function batchDecay(store: FlyupMemStore): {
    processed: number;
    statusChanges: Array<{
        id: string;
        from: Status;
        to: string;
    }>;
};
//# sourceMappingURL=batch-decay.d.ts.map