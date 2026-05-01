import type { Engram, Observation } from '../core/types.js';
import type { FlyupMemStore } from '../core/store.js';
/**
 * Cluster engrams by embedding similarity.
 * Groups engrams with cosine similarity > threshold into clusters.
 */
export declare function clusterByEmbedding(engrams: Engram[], threshold?: number): Promise<Engram[][]>;
/**
 * Detect polarity conflicts within a cluster.
 */
export declare function hasPolarityConflict(cluster: Engram[]): boolean;
/**
 * Merge a cluster of engrams into a single Observation.
 */
export declare function mergeToObservation(cluster: Engram[]): Observation;
/**
 * Mark engrams with polarity conflicts as evolution (don't merge).
 */
export declare function markAsEvolution(cluster: Engram[], store: FlyupMemStore): void;
/**
 * Main consolidation: find unmerged engrams, cluster, merge into Observations.
 */
export declare function consolidateUnmerged(store: FlyupMemStore, batchSize?: number): Promise<{
    merged: number;
    conflicts: number;
    skipped: number;
}>;
//# sourceMappingURL=consolidate.d.ts.map