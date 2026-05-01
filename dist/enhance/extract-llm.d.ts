import type { Engram } from '../core/types.js';
import type { LLMClient } from './llm-client.js';
/**
 * Use LLM to extract engrams from a conversation turn.
 * Returns higher-quality, structured extractions than rule-based approach.
 */
export declare function extractEngramsLLM(userMsg: string, assistantMsg: string, llm: LLMClient, existingIds?: string[], origin?: string): Promise<Omit<Engram, 'content_hash'>[]>;
//# sourceMappingURL=extract-llm.d.ts.map