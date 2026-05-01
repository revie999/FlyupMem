import type { FlyupMemStore } from '../core/store.js';
import type { Memory } from '../core/types.js';
export interface RecallResult {
    memories: Memory[];
    injection: string;
    count: number;
}
/**
 * Recall memories relevant to a query.
 */
export declare function flyupRecall(query: string, store: FlyupMemStore, tokenBudget?: number): Promise<RecallResult>;
//# sourceMappingURL=flyup_recall.d.ts.map