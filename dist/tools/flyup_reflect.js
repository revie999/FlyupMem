// src/tools/flyup_reflect.ts — Reflect tool
import { createLLMClient } from '../enhance/llm-client.js';
import { reflect } from '../enhance/reflect.js';
/**
 * Run Reflect: synthesize Mental Models from Observations.
 */
export async function flyupReflect(query, store, llmConfig) {
    store.load();
    const llm = llmConfig
        ? new (await import('../enhance/llm-client.js')).LLMClient(llmConfig)
        : createLLMClient();
    if (!llm) {
        return { success: false, error: 'No LLM client configured. Set FLYUP_LLM_API_KEY or pass llmConfig.' };
    }
    try {
        const result = await reflect(query, store, llm);
        if (!result) {
            return { success: false, error: 'Not enough observations to synthesize (need ≥2).' };
        }
        return { success: true, mentalModel: result };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}
//# sourceMappingURL=flyup_reflect.js.map