// src/search/semantic.ts — Semantic search via embeddings

import type { Memory, ScoredResult } from '../core/types.js'
import { embed, cosineSimilarity, isEmbeddingAvailable } from './embed.js'

const MIN_SEMANTIC_SCORE = 0.5

/**
 * Check if semantic search is available (embedding model loaded).
 */
export function isSemanticAvailable(): boolean {
  return isEmbeddingAvailable()
}

/**
 * Semantic search: find memories by cosine similarity of embeddings.
 * Returns empty if embedding model is unavailable.
 */
export async function semanticSearch(
  query: string,
  memories: Memory[],
  limit = 30,
): Promise<ScoredResult[]> {
  const queryEmb = await embed(query)
  if (!queryEmb) return []

  const scored: ScoredResult[] = []
  for (const mem of memories) {
    // Embeddings should be pre-computed and stored; for now, compute on the fly
    const memEmb = await embed(mem.statement)
    if (!memEmb) continue
    const score = cosineSimilarity(queryEmb, memEmb)
    if (score >= MIN_SEMANTIC_SCORE) {
      scored.push({ id: mem.id, score })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
