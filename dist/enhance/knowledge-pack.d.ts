import type { FlyupMemStore } from '../core/store.js';
import type { Engram, Observation, MentalModel } from '../core/types.js';
export interface KnowledgePack {
    version: string;
    exported_at: string;
    source: string;
    stats: {
        engrams: number;
        observations: number;
        mental_models: number;
    };
    engrams: Engram[];
    observations: Observation[];
    mental_models: MentalModel[];
}
/**
 * Export all memories as a Knowledge Pack (JSON or YAML).
 */
export declare function exportKnowledgePack(store: FlyupMemStore, format?: 'json' | 'yaml'): string;
/**
 * Export Knowledge Pack to a file.
 */
export declare function exportKnowledgePackToFile(store: FlyupMemStore, filePath: string, format?: 'json' | 'yaml'): void;
/**
 * Import memories from a Knowledge Pack.
 * Skips duplicates by content_hash.
 */
export declare function importKnowledgePack(store: FlyupMemStore, packContent: string, format?: 'json' | 'yaml'): {
    imported: number;
    skipped: number;
    errors: number;
};
/**
 * Import from a file path.
 */
export declare function importKnowledgePackFromFile(store: FlyupMemStore, filePath: string): {
    imported: number;
    skipped: number;
    errors: number;
};
//# sourceMappingURL=knowledge-pack.d.ts.map