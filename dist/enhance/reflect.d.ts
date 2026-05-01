import type { MentalModel } from '../core/types.js';
import type { LLMClient } from './llm-client.js';
import type { FlyupMemStore } from '../core/store.js';
/**
 * Use LLM to synthesize a Mental Model from related Observations.
 */
export declare function reflect(query: string, store: FlyupMemStore, llm: LLMClient): Promise<MentalModel | null>;
//# sourceMappingURL=reflect.d.ts.map