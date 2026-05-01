/**
 * Lazy-load the embedding model. Returns true if model is available.
 */
export declare function initEmbedder(): Promise<boolean>;
/**
 * Compute embedding for a text string.
 * Returns Float32Array normalized to unit length, or null if model unavailable.
 */
export declare function embed(text: string): Promise<Float32Array | null>;
/**
 * Compute cosine similarity between two normalized vectors.
 */
export declare function cosineSimilarity(a: Float32Array, b: Float32Array): number;
/**
 * Check if embedding model is available.
 */
export declare function isEmbeddingAvailable(): boolean;
//# sourceMappingURL=embed.d.ts.map