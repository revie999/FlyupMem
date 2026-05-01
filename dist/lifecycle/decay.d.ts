import type { Activation, Layer } from '../core/types.js';
/**
 * Compute decayed retrieval strength using ACT-R formula.
 * effective_lambda = base_lambda * (1 - emotional_weight / 20)
 */
export declare function decayedStrength(retrievalStrength: number, daysSinceAccess: number, layer: Layer, emotionalWeight?: number): number;
/**
 * Boost retrieval strength on access (+0.1, capped at 1.0).
 */
export declare function reactivate(current: number): number;
/**
 * Map retrieval strength to status.
 */
export declare function statusFromStrength(strength: number): string;
/**
 * Compute current activation score (retrieval strength + frequency boost).
 */
export declare function computeActivation(activation: Activation, layer: Layer, emotionalWeight?: number): number;
/**
 * Get days since ISO date string.
 */
export declare function daysSince(isoDate: string): number;
//# sourceMappingURL=decay.d.ts.map