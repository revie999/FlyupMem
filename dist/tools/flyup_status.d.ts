import type { FlyupMemStore } from '../core/store.js';
export interface StatusResult {
    stats: ReturnType<FlyupMemStore['stats']>;
    health: ReturnType<FlyupMemStore['healthCheck']>;
}
/**
 * Get memory store statistics and health.
 */
export declare function flyupStatus(store: FlyupMemStore): StatusResult;
//# sourceMappingURL=flyup_status.d.ts.map