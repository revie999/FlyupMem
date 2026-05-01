// src/tools/flyup_status.ts — Memory statistics
/**
 * Get memory store statistics and health.
 */
export function flyupStatus(store) {
    store.load();
    return {
        stats: store.stats(),
        health: store.healthCheck(),
    };
}
//# sourceMappingURL=flyup_status.js.map