// src/tools/flyup_learn.ts — Learn from conversation
import { extractEngramsFromTurn } from '../lifecycle/extract.js';
import { applyDedup } from '../lifecycle/dedup.js';
import { contentHash } from '../core/hash.js';
/**
 * Learn from a conversation turn: extract → dedup → store.
 */
export function flyupLearn(userMsg, assistantMsg, store, origin = 'hermes:telegram') {
    store.load();
    const existingIds = store.engrams.map(e => e.id);
    const candidates = extractEngramsFromTurn(userMsg, assistantMsg, existingIds, origin);
    let stored = 0;
    let skipped = 0;
    const engramIds = [];
    for (const candidate of candidates) {
        // Set content_hash
        const engram = { ...candidate, content_hash: contentHash(candidate.statement) };
        const result = applyDedup(engram, store);
        if (result.action === 'ADD') {
            stored++;
            engramIds.push(engram.id);
        }
        else {
            skipped++;
            if (result.existingId)
                engramIds.push(result.existingId);
        }
    }
    // Save if anything changed
    if (stored > 0 || skipped > 0) {
        store.save();
    }
    return {
        extracted: candidates.length,
        stored,
        skipped,
        engramIds,
    };
}
//# sourceMappingURL=flyup_learn.js.map