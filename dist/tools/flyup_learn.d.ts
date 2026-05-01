import type { FlyupMemStore } from '../core/store.js';
export interface LearnResult {
    extracted: number;
    stored: number;
    skipped: number;
    engramIds: string[];
}
/**
 * Learn from a conversation turn: extract → dedup → store.
 */
export declare function flyupLearn(userMsg: string, assistantMsg: string, store: FlyupMemStore, origin?: string): LearnResult;
//# sourceMappingURL=flyup_learn.d.ts.map