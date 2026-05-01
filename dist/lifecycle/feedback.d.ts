import type { FeedbackEntry, FeedbackSignal } from '../core/types.js';
import type { FlyupMemStore } from '../core/store.js';
/**
 * Apply a feedback signal to a memory.
 * Updates activation, confidence, and may trigger auto-retirement.
 */
export declare function applyFeedback(memoryId: string, signal: FeedbackSignal, store: FlyupMemStore, context?: string): {
    applied: boolean;
    retired: boolean;
    reason?: string;
};
/**
 * Get feedback summary for a memory.
 */
export declare function getFeedbackSummary(memoryId: string, store: FlyupMemStore): {
    memoryId: string;
    feedback: any;
    recentFeedback: FeedbackEntry[];
    totalFeedback: number;
} | null;
//# sourceMappingURL=feedback.d.ts.map