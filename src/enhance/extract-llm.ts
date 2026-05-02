// src/enhance/extract-llm.ts — LLM-enhanced engram extraction

import type { Engram, MemoryType, Polarity } from '../core/types.js'
import type { LLMClient } from './llm-client.js'
import { generateId, nextSequence } from '../core/id.js'

const EXTRACT_SYSTEM_PROMPT = `You are a knowledge extraction engine. Extract structured facts from the conversation below.

Rules:
- Extract only concrete, actionable knowledge (not vague impressions)
- Each fact should be self-contained and unambiguous
- Classify each fact's type and polarity
- Extract entity relationships when present

Return a JSON array of objects with this schema:
[{
  "statement": "concise factual statement",
  "type": "behavioral|terminological|procedural|architectural",
  "polarity": "do|dont|null",
  "entities": [{"name": "...", "type": "tool|person|project|concept|language"}],
  "rationale": "why this matters (optional)",
  "confidence": 1-10
}]

Return ONLY valid JSON, no markdown fences.`

interface ExtractedFact {
  statement: string
  type: MemoryType
  polarity: Polarity
  entities: Array<{ name: string; type: string }>
  rationale?: string
  confidence?: number
}

/**
 * Use LLM to extract engrams from a conversation turn.
 * Returns higher-quality, structured extractions than rule-based approach.
 */
export async function extractEngramsLLM(
  userMsg: string,
  assistantMsg: string,
  llm: LLMClient,
  existingIds: string[] = [],
  origin: string = 'hermes:telegram',
): Promise<Omit<Engram, 'content_hash'>[]> {
  const prompt = `User: ${userMsg}\nAssistant: ${assistantMsg}`

  const response = await llm.complete(prompt, EXTRACT_SYSTEM_PROMPT)

  let facts: ExtractedFact[]
  try {
    // Try to parse JSON, handling potential markdown fences
    const cleaned = response.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    facts = JSON.parse(cleaned)
  } catch {
    return [] // If LLM returns invalid JSON, fall back to empty
  }

  if (!Array.isArray(facts)) return []

  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  return facts.map((fact, i) => {
    const seq = nextSequence([...existingIds], 'raw') + i

    return {
      id: generateId('raw', seq),
      version: 1,
      layer: 'raw',
      status: 'candidate',
      consolidated: false,

      type: fact.type ?? 'behavioral',
      memory_class: 'semantic',
      polarity: fact.polarity ?? null,
      commitment: 'exploring',
      scope: 'global',
      visibility: 'private',
      domain: 'general',
      tags: [],

      statement: fact.statement,
      rationale: fact.rationale ?? '',
      contraindications: [],

      entities: fact.entities ?? [],
      temporal: {
        learned_at: now,
        valid_from: now,
        valid_until: null,
      },
      source: {
        episode_id: null,
        quote: userMsg.slice(0, 200),
        origin,
      },

      activation: {
        retrieval_strength: 0.8,
        storage_strength: 0.5,
        frequency: 1,
        turn_count: 0,
        last_accessed: today,
      },
      emotional_weight: 5,
      confidence: fact.confidence ?? 5,

      associations: [],
      feedback: { positive: 0, negative: 0, neutral: 0 },
      previous_version_ref: null,
      derivation_count: 1,
    }
  })
}
