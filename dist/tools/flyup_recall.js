// src/tools/flyup_recall.ts — Search memories
import { unifiedRecall } from '../search/recall.js';
/**
 * Recall memories relevant to a query.
 */
export async function flyupRecall(query, store, tokenBudget) {
    store.load();
    const { memories, injection } = await unifiedRecall(query, store, tokenBudget);
    return { memories, injection, count: memories.length };
}
//# sourceMappingURL=flyup_recall.js.map