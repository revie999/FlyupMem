import { Layer } from './types.js';
/**
 * Generate a layer-prefixed ID: ENG-20260501-001
 */
export declare function generateId(layer: Layer, sequence?: number): string;
/**
 * Generate episode ID
 */
export declare function generateEpisodeId(): string;
/**
 * Generate feedback ID
 */
export declare function generateFeedbackId(): string;
/**
 * Parse date from ID (ENG-20260501-001 → 2026-05-01)
 */
export declare function dateFromId(id: string): string | null;
/**
 * Get next sequence number for a given prefix+date combo
 */
export declare function nextSequence(existingIds: string[], layer: Layer): number;
//# sourceMappingURL=id.d.ts.map