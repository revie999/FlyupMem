// src/search/bm25.ts — BM25 scoring (in-memory + SQLite FTS5 acceleration)

import type { ScoredResult } from '../core/types.js'
import type { SQLiteCache } from '../core/sqlite-cache.js'
import { tokenize, buildDFMap } from './tokenize.js'

const K1 = 1.2
const B = 0.75

/**
 * Compute BM25 score for a single query-document pair.
 */
export function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  avgDocLen: number,
  docCount: number,
  dfMap: Map<string, number>,
): number {
  let score = 0
  for (const qt of queryTokens) {
    const df = dfMap.get(qt) ?? 0
    const idf = Math.max(0, Math.log((docCount - df + 0.5) / (df + 0.5) + 1))
    const tf = docTokens.filter(t => t === qt).length
    const dl = docTokens.length
    score += idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * dl / avgDocLen))
  }
  return score
}

/**
 * BM25 search with optional FTS5 acceleration.
 *
 * When `cache` is provided and available, uses SQLite FTS5 trigram search
 * which is much faster for large document sets. Falls back to in-memory
 * BM25 when FTS5 is unavailable or returns no results.
 */
export function bm25Search(
  query: string,
  documents: Array<{ id: string; text: string }>,
  limit = 30,
  cache?: SQLiteCache,
): ScoredResult[] {
  // Try FTS5 first if cache is available
  if (cache?.isAvailable) {
    const ftsResults = cache.ftsSearch(query, limit)
    if (ftsResults.length > 0) {
      // FTS5 returns rank (lower = better); convert to score (higher = better)
      // Normalize: best rank gets score 1.0, others proportional
      const minRank = Math.min(...ftsResults.map(r => r.rank))
      return ftsResults.map(r => ({
        id: r.id,
        // rank is negative in FTS5 bm25(); closer to 0 = worse; more negative = better
        // Convert to positive score: 1.0 for best, decreasing
        score: minRank !== 0 ? (minRank / r.rank) : 1.0,
      }))
    }
    // FTS5 returned nothing — fall through to in-memory BM25
  }

  // In-memory BM25 fallback
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const tokenizedDocs = documents.map(d => tokenize(d.text))
  const avgDocLen = tokenizedDocs.reduce((s, t) => s + t.length, 0) / (tokenizedDocs.length || 1)
  const dfMap = buildDFMap(tokenizedDocs)
  const docCount = documents.length

  const scored: ScoredResult[] = documents.map((doc, i) => ({
    id: doc.id,
    score: bm25Score(queryTokens, tokenizedDocs[i], avgDocLen, docCount, dfMap),
  }))

  return scored
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
