// src/search/semantic.ts — Semantic search via embeddings with SQLite cache

import type { Memory, ScoredResult } from '../core/types.js'
import type { FlyupMemStore } from '../core/store.js'
import { embed, embedBatch, cosineSimilarity, isEmbeddingAvailable } from './embed.js'

const MIN_SEMANTIC_SCORE = 0.5

/**
 * Check if semantic search is available (embedding model loaded).
 */
export function isSemanticAvailable(): boolean {
  return isEmbeddingAvailable()
}

/**
 * Semantic search: find memories by cosine similarity of embeddings.
 * Uses SQLite cache for embedding vectors to avoid recomputation.
 * Returns empty if embedding model is unavailable.
 */
export async function semanticSearch(
  query: string,
  memories: Memory[],
  limit = 30,
  store?: FlyupMemStore,
): Promise<ScoredResult[]> {
  const queryEmb = await embed(query, store?.cache)
  if (!queryEmb) return []

  // Batch embed all memories (cache-aware)
  const items = memories.map(m => ({ text: m.statement, cacheKey: m.id }))
  const embeddings = await embedBatch(items, store?.cache)

  const scored: ScoredResult[] = []
  for (const mem of memories) {
    const memEmb = embeddings.get(mem.id)
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
