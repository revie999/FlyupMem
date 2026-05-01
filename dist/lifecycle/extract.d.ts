import type { Engram } from '../core/types.js';
/**
 * Extract candidate engrams from a (user, assistant) turn pair.
 * Returns raw engrams with status='candidate'.
 */
export declare function extractEngramsFromTurn(userMsg: string, assistantMsg: string, existingIds?: string[], origin?: string): Omit<Engram, 'content_hash'>[];
/**
 * Promote candidate to active if conditions are met.
 */
export declare function shouldPromote(engram: Engram, duplicateCount: number): boolean;
//# sourceMappingURL=extract.d.ts.map