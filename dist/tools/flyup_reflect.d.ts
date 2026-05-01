import type { FlyupMemStore } from '../core/store.js';
import type { MentalModel } from '../core/types.js';
import type { LLMConfig } from '../enhance/llm-client.js';
export interface ReflectResult {
    success: boolean;
    mentalModel?: MentalModel;
    error?: string;
}
/**
 * Run Reflect: synthesize Mental Models from Observations.
 */
export declare function flyupReflect(query: string, store: FlyupMemStore, llmConfig?: LLMConfig): Promise<ReflectResult>;
//# sourceMappingURL=flyup_reflect.d.ts.map