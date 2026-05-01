// src/search/semantic.ts — Semantic search via embeddings
import { embed, cosineSimilarity, isEmbeddingAvailable } from './embed.js';
/**
 * Check if semantic search is available (embedding model loaded).
 */
export function isSemanticAvailable() {
    return isEmbeddingAvailable();
}
/**
 * Semantic search: find memories by cosine similarity of embeddings.
 * Returns empty if embedding model is unavailable.
 */
export async function semanticSearch(query, memories, limit = 30) {
    const queryEmb = await embed(query);
    if (!queryEmb)
        return [];
    const scored = [];
    for (const mem of memories) {
        // Embeddings should be pre-computed and stored; for now, compute on the fly
        const memEmb = await embed(mem.statement);
        if (!memEmb)
            continue;
        const score = cosineSimilarity(queryEmb, memEmb);
        if (score > 0.1) { // minimum threshold
            scored.push({ id: mem.id, score });
        }
    }
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
//# sourceMappingURL=semantic.js.map