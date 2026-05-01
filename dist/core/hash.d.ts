/**
 * Compute SHA-256 hash of a normalized statement.
 * Normalization: lowercase, collapse whitespace, trim.
 */
export declare function contentHash(statement: string): string;
/**
 * Check if two statements are exact duplicates (same hash).
 */
export declare function isDuplicate(hash1: string, hash2: string): boolean;
//# sourceMappingURL=hash.d.ts.map