// src/tools/flyup_reflect.ts — Reflect tool

import type { FlyupMemStore } from '../core/store.js'
import type { MentalModel } from '../core/types.js'
import type { LLMConfig } from '../enhance/llm-client.js'
import { createLLMClient } from '../enhance/llm-client.js'
import { reflect } from '../enhance/reflect.js'

export interface ReflectResult {
  success: boolean
  mentalModel?: MentalModel
  error?: string
}

/**
 * Run Reflect: synthesize Mental Models from Observations.
 */
export async function flyupReflect(
  query: string,
  store: FlyupMemStore,
  llmConfig?: LLMConfig,
): Promise<ReflectResult> {
  store.load()

  const llm = llmConfig
    ? new (await import('../enhance/llm-client.js')).LLMClient(llmConfig)
    : createLLMClient()

  if (!llm) {
    return { success: false, error: 'No LLM client configured. Set FLYUP_LLM_API_KEY or pass llmConfig.' }
  }

  try {
    const result = await reflect(query, store, llm)
    if (!result) {
      return { success: false, error: 'Not enough observations to synthesize (need ≥2).' }
    }
    return { success: true, mentalModel: result }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
