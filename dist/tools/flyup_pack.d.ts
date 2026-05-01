import type { FlyupMemStore } from '../core/store.js';
export interface PackResult {
    action: 'export' | 'import';
    success: boolean;
    details: string;
}
/**
 * Export or import a Knowledge Pack.
 */
export declare function flyupPack(action: 'export' | 'import', filePath: string, store: FlyupMemStore): PackResult;
//# sourceMappingURL=flyup_pack.d.ts.map