import type { FlyupMemStore } from '../core/store.js';
import type { FeedbackSignal } from '../core/types.js';
import { getFeedbackSummary } from '../lifecycle/feedback.js';
export interface FeedbackResult {
    applied: boolean;
    retired: boolean;
    reason?: string;
    summary?: ReturnType<typeof getFeedbackSummary>;
}
/**
 * Record a feedback signal for a memory.
 */
export declare function flyupFeedback(memoryId: string, signal: FeedbackSignal, store: FlyupMemStore, context?: string): FeedbackResult;
//# sourceMappingURL=flyup_feedback.d.ts.map