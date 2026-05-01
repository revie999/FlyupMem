// src/tools/flyup_maintain.ts — Maintenance operations tool
import { batchDecay } from '../lifecycle/batch-decay.js';
import { consolidateUnmerged } from '../lifecycle/consolidate.js';
import { maintainGraphBulk } from '../lifecycle/graph-maintain.js';
/**
 * Run all maintenance operations.
 */
export async function flyupMaintain(store) {
    store.load();
    // 1. Batch decay
    const decayResult = batchDecay(store);
    // 2. Consolidate unmerged engrams
    const consolidateResult = await consolidateUnmerged(store);
    // 3. Graph maintenance
    const graphResult = maintainGraphBulk(store);
    return {
        decay: { processed: decayResult.processed, statusChanges: decayResult.statusChanges.length },
        consolidation: consolidateResult,
        graph: graphResult,
    };
}
//# sourceMappingURL=flyup_maintain.js.map