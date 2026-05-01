// src/tools/flyup_feedback.ts — Feedback tool
import { applyFeedback, getFeedbackSummary } from '../lifecycle/feedback.js';
/**
 * Record a feedback signal for a memory.
 */
export function flyupFeedback(memoryId, signal, store, context) {
    store.load();
    const result = applyFeedback(memoryId, signal, store, context);
    const summary = getFeedbackSummary(memoryId, store);
    return { ...result, summary: summary ?? undefined };
}
//# sourceMappingURL=flyup_feedback.js.map