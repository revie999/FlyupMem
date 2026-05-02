// src/search/embed.ts — Embedding computation via BGE-small-zh ONNX with SQLite cache

import type { SQLiteCache } from '../core/sqlite-cache.js'

let pipeline: any = null
let embedder: any = null
let modelReady = false
let modelLoading = false

const MODEL_NAME = 'Xenova/bge-small-zh-v1.5'
const DIMENSION = 512 // BGE-small-zh output dimension

/**
 * Lazy-load the embedding model. Returns true if model is available.
 */
export async function initEmbedder(): Promise<boolean> {
  if (modelReady) return true
  if (modelLoading) {
    // Wait for existing load
    while (modelLoading) {
      await new Promise(r => setTimeout(r, 100))
    }
    return modelReady
  }

  modelLoading = true
  try {
    const { pipeline: pl } = await import('@xenova/transformers')
    pipeline = pl
    embedder = await pipeline('feature-extraction', MODEL_NAME, {
      quantized: true,
    })
    modelReady = true
  } catch (err) {
    console.warn('[FlyupMem] Embedding model unavailable, falling back to BM25-only:', (err as Error).message)
    modelReady = false
  } finally {
    modelLoading = false
  }
  return modelReady
}

/**
 * Compute embedding for a text string.
 * Returns Float32Array normalized to unit length, or null if model unavailable.
 *
 * If `cache` is provided, checks SQLite first and stores result after computation.
 * `cacheKey` defaults to the text itself; pass a memory ID for stable caching.
 */
export async function embed(text: string, cache?: SQLiteCache, cacheKey?: string): Promise<Float32Array | null> {
  if (!modelReady && !(await initEmbedder())) return null

  const key = cacheKey ?? text

  // Check cache first
  if (cache?.isAvailable) {
    const cached = cache.vecGet(key)
    if (cached) {
      return bufferToFloat32(cached)
    }
  }

  try {
    const output = await embedder(text, { pooling: 'mean', normalize: true })
    const data = output.data as Float32Array
    const vec = new Float32Array(data)

    // Store in cache
    if (cache?.isAvailable) {
      cache.vecUpsert(key, float32ToBuffer(vec), 'engram')
    }

    return vec
  } catch {
    return null
  }
}

/**
 * Batch embed multiple texts. Uses cache where possible, computes the rest.
 * Returns a Map of cacheKey → Float32Array.
 */
export async function embedBatch(
  items: Array<{ text: string; cacheKey: string }>,
  cache?: SQLiteCache,
): Promise<Map<string, Float32Array>> {
  const results = new Map<string, Float32Array>()
  const toCompute: Array<{ text: string; cacheKey: string }> = []

  // Check cache for all items
  for (const item of items) {
    if (cache?.isAvailable) {
      const cached = cache.vecGet(item.cacheKey)
      if (cached) {
        results.set(item.cacheKey, bufferToFloat32(cached))
        continue
      }
    }
    toCompute.push(item)
  }

  if (toCompute.length === 0) return results

  // Compute missing embeddings
  if (!modelReady && !(await initEmbedder())) return results

  for (const item of toCompute) {
    try {
      const output = await embedder(item.text, { pooling: 'mean', normalize: true })
      const vec = new Float32Array(output.data as Float32Array)
      results.set(item.cacheKey, vec)

      // Store in cache
      if (cache?.isAvailable) {
        cache.vecUpsert(item.cacheKey, float32ToBuffer(vec), 'engram')
      }
    } catch {
      // Skip failed embeddings
    }
  }

  return results
}

/**
 * Compute cosine similarity between two normalized vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
  }
  return Math.max(0, dot) // already normalized, dot product = cosine
}

/**
 * Check if embedding model is available.
 */
export function isEmbeddingAvailable(): boolean {
  return modelReady
}

/**
 * Get embedding dimension.
 */
export function getEmbeddingDimension(): number {
  return DIMENSION
}

// ─── Buffer conversion helpers ──────────────────────────────

function float32ToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)
}

function bufferToFloat32(buf: Buffer): Float32Array {
  // Buffer is a Uint8Array view; copy into a new ArrayBuffer for Float32Array
  const ab = new ArrayBuffer(buf.byteLength)
  const view = new Uint8Array(ab)
  view.set(buf)
  return new Float32Array(ab)
}
