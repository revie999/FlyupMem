// src/search/rerank.ts — 8-dimensional local rerank
import { computeActivation } from '../lifecycle/decay.js';
import { daysSince } from '../lifecycle/decay.js';
const WEIGHTS = {
    relevance: 0.25,
    specificity: 0.10,
    activation: 0.15,
    recency: 0.15,
    evidenceStrength: 0.10,
    confidence: 0.10,
    scope: 0.10,
    polarity: 0.05,
};
/**
 * Compute specificity from statement length (log-scaled).
 */
function computeSpecificity(statement) {
    const len = statement.length;
    return Math.min(1.0, Math.log1p(len) / Math.log1p(200));
}
/**
 * Compute recency score from learned_at date.
 */
function computeRecency(learnedAt) {
    if (!learnedAt)
        return 0.5;
    const days = daysSince(learnedAt);
    return Math.exp(-days / 30); // 30-day half-life
}
/**
 * Compute evidence strength from proof count and evidence chain.
 */
function computeEvidenceStrength(mem) {
    let strength = 0;
    if ('proof_count' in mem && mem.proof_count) {
        strength += Math.min(0.5, mem.proof_count * 0.1);
    }
    if ('evidence' in mem && Array.isArray(mem.evidence)) {
        strength += Math.min(0.3, mem.evidence.length * 0.1);
    }
    if ('source_memory_ids' in mem && Array.isArray(mem.source_memory_ids)) {
        strength += Math.min(0.2, mem.source_memory_ids.length * 0.05);
    }
    return Math.min(1.0, strength);
}
/**
 * Compute scope match: global gets base, matching scope gets bonus.
 */
function computeScopeMatch(memScope, queryScope) {
    if (!queryScope)
        return 0.5; // no scope context
    if (memScope === 'global')
        return 0.7; // global is always relevant
    if (memScope === queryScope)
        return 1.0; // exact match
    if (memScope.startsWith(queryScope) || queryScope.startsWith(memScope))
        return 0.8;
    return 0.3;
}
/**
 * Compute polarity alignment (simplified: do-match gets higher score).
 */
function computePolarity(polarity) {
    if (polarity === 'do')
        return 0.8;
    if (polarity === 'dont')
        return 0.6; // still valuable, but slightly lower
    return 0.5;
}
/**
 * 8-dimensional local rerank.
 * Takes a list of candidate memories with their relevance scores,
 * and re-ranks them using all 8 dimensions.
 */
export function localRerank(candidates, queryScope) {
    const scored = candidates.map(({ memory: mem, relevanceScore }) => {
        const dims = {
            relevance: Math.min(1.0, relevanceScore),
            specificity: computeSpecificity(mem.statement),
            activation: computeActivation(mem.activation, mem.layer, mem.emotional_weight ?? 5),
            recency: computeRecency(mem.temporal?.learned_at),
            evidenceStrength: computeEvidenceStrength(mem),
            confidence: (mem.confidence ?? 5) / 10,
            scope: computeScopeMatch(mem.scope ?? 'global', queryScope ?? null),
            polarity: computePolarity(mem.polarity ?? null),
        };
        // Weighted sum
        let finalScore = 0;
        for (const [dim, weight] of Object.entries(WEIGHTS)) {
            finalScore += dims[dim] * weight;
        }
        return { id: mem.id, score: finalScore };
    });
    return scored.sort((a, b) => b.score - a.score);
}
//# sourceMappingURL=rerank.js.map