// src/search/bm25.ts — BM25 scoring
import { tokenize, buildDFMap } from './tokenize.js';
const K1 = 1.2;
const B = 0.75;
/**
 * Compute BM25 score for a single query-document pair.
 */
export function bm25Score(queryTokens, docTokens, avgDocLen, docCount, dfMap) {
    let score = 0;
    for (const qt of queryTokens) {
        const df = dfMap.get(qt) ?? 0;
        const idf = Math.max(0, Math.log((docCount - df + 0.5) / (df + 0.5) + 1));
        const tf = docTokens.filter(t => t === qt).length;
        const dl = docTokens.length;
        score += idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * dl / avgDocLen));
    }
    return score;
}
/**
 * BM25 search over a set of (id, text) entries.
 */
export function bm25Search(query, documents, limit = 30) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0)
        return [];
    const tokenizedDocs = documents.map(d => tokenize(d.text));
    const avgDocLen = tokenizedDocs.reduce((s, t) => s + t.length, 0) / (tokenizedDocs.length || 1);
    const dfMap = buildDFMap(tokenizedDocs);
    const docCount = documents.length;
    const scored = documents.map((doc, i) => ({
        id: doc.id,
        score: bm25Score(queryTokens, tokenizedDocs[i], avgDocLen, docCount, dfMap),
    }));
    return scored
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
//# sourceMappingURL=bm25.js.map