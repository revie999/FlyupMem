// src/core/hash.ts — Content hash for dedup
import { createHash } from 'node:crypto';
/**
 * Compute SHA-256 hash of a normalized statement.
 * Normalization: lowercase, collapse whitespace, trim.
 */
export function contentHash(statement) {
    const normalized = statement
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    return 'sha256:' + createHash('sha256').update(normalized).digest('hex');
}
/**
 * Check if two statements are exact duplicates (same hash).
 */
export function isDuplicate(hash1, hash2) {
    return hash1 === hash2;
}
//# sourceMappingURL=hash.js.map