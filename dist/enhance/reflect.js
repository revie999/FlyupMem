// src/enhance/reflect.ts — Reflect: synthesize Mental Models from Observations
import { generateId } from '../core/id.js';
import { unifiedRecall } from '../search/recall.js';
const REFLECT_SYSTEM_PROMPT = `You are a mental model synthesizer. Given a set of related observations about a user or project, create a concise, actionable mental model statement.

Rules:
- The mental model should capture the PATTERN, not individual facts
- It should be prescriptive ("the user prefers X over Y") not descriptive
- Keep it under 200 words
- Include a brief rationale

Return JSON:
{
  "title": "short descriptive title",
  "statement": "the mental model statement",
  "domain": "relevant domain",
  "confidence": 1-10
}

Return ONLY valid JSON, no markdown fences.`;
/**
 * Use LLM to synthesize a Mental Model from related Observations.
 */
export async function reflect(query, store, llm) {
    // Get relevant observations
    const { memories } = await unifiedRecall(query, store, 4096);
    const observations = memories.filter(m => m.layer === 'observation');
    if (observations.length < 2)
        return null; // Need at least 2 observations
    // Format observations for LLM
    const obsText = observations
        .map((obs, i) => `[${i + 1}] ${obs.title || obs.statement}\n    Evidence: ${obs.proof_count} sources, confidence: ${obs.confidence}/10`)
        .join('\n\n');
    const prompt = `Synthesize a mental model from these observations:\n\n${obsText}\n\nQuery context: ${query}`;
    const response = await llm.complete(prompt, REFLECT_SYSTEM_PROMPT);
    let result;
    try {
        const cleaned = response.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
        result = JSON.parse(cleaned);
    }
    catch {
        return null;
    }
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const mentalModel = {
        id: generateId('mental_model'),
        layer: 'mental_model',
        status: 'active',
        scope: 'global',
        domain: result.domain ?? 'general',
        tags: [],
        title: result.title ?? 'Synthesized Mental Model',
        statement: result.statement ?? '',
        source_observation_ids: observations.map(o => o.id),
        proof_count: observations.reduce((s, o) => s + o.proof_count, 0),
        confidence: Math.min(10, result.confidence ?? 7),
        trend: 'new',
        refresh_policy: {
            cadence: 'weekly',
            stale_after_days: 60,
        },
        last_refreshed: now,
        activation: {
            retrieval_strength: 0.9,
            storage_strength: 1.0,
            frequency: 1,
            last_accessed: today,
        },
        emotional_weight: 7,
        entities: [],
        temporal: {
            learned_at: now,
            valid_from: now,
            valid_until: null,
        },
    };
    store.addMentalModel(mentalModel);
    store.save();
    return mentalModel;
}
//# sourceMappingURL=reflect.js.map