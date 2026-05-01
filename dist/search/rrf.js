// src/search/rrf.ts — Reciprocal Rank Fusion
/**
 * RRF (Reciprocal Rank Fusion): merge multiple ranked lists into one.
 * Formula: score(d) = Σ 1/(k + rank_i(d))
 *
 * @param resultLists - Array of ranked result lists from different retrieval signals
 * @param k - Smoothing constant (default 60, standard in literature)
 */
export function rrfMerge(resultLists, k = 60) {
    const rrfScores = new Map();
    for (const results of resultLists) {
        for (let rank = 0; rank < results.length; rank++) {
            const docId = results[rank].id;
            rrfScores.set(docId, (rrfScores.get(docId) ?? 0) + 1.0 / (k + rank + 1));
        }
    }
    return [...rrfScores.entries()]
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score);
}
//# sourceMappingURL=rrf.js.map