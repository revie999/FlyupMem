// src/core/id.ts — ID generation
const PREFIXES = {
    mental_model: 'MM',
    observation: 'OBS',
    raw: 'ENG',
    experience: 'EXP',
};
/**
 * Generate a layer-prefixed ID: ENG-20260501-001
 */
export function generateId(layer, sequence) {
    const prefix = PREFIXES[layer];
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(sequence ?? Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `${prefix}-${date}-${seq}`;
}
/**
 * Generate episode ID
 */
export function generateEpisodeId() {
    return generateId('experience').replace('EXP-', 'EP-');
}
/**
 * Generate feedback ID
 */
export function generateFeedbackId() {
    const ts = Date.now().toString(36);
    return `FB-${ts}`;
}
/**
 * Parse date from ID (ENG-20260501-001 → 2026-05-01)
 */
export function dateFromId(id) {
    const match = id.match(/^[A-Z]+-(\d{8})-\d+$/);
    if (!match)
        return null;
    const d = match[1];
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
/**
 * Get next sequence number for a given prefix+date combo
 */
export function nextSequence(existingIds, layer) {
    const prefix = PREFIXES[layer];
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const pattern = new RegExp(`^${prefix}-${date}-(\\d+)$`);
    let max = 0;
    for (const id of existingIds) {
        const m = id.match(pattern);
        if (m)
            max = Math.max(max, parseInt(m[1], 10));
    }
    return max + 1;
}
//# sourceMappingURL=id.js.map