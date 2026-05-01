// src/search/embed.ts — Embedding computation via BGE-small-zh ONNX


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
 */
export async function embed(text: string): Promise<Float32Array | null> {
  if (!modelReady && !(await initEmbedder())) return null

  try {
    const output = await embedder(text, { pooling: 'mean', normalize: true })
    const data = output.data as Float32Array
    return new Float32Array(data)
  } catch {
    return null
  }
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
