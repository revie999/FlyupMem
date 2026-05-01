import type { FlyupMemStore } from '../core/store.js';
export interface MaintainResult {
    decay: {
        processed: number;
        statusChanges: number;
    };
    consolidation: {
        merged: number;
        conflicts: number;
        skipped: number;
    };
    graph: {
        processed: number;
    };
}
/**
 * Run all maintenance operations.
 */
export declare function flyupMaintain(store: FlyupMemStore): Promise<MaintainResult>;
//# sourceMappingURL=flyup_maintain.d.ts.map