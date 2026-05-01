// src/lifecycle/extract.ts — Rule-based engram extraction from conversation
import { generateId, nextSequence } from '../core/id.js';
const PATTERNS = [
    // User corrections
    { regex: /不是[，,]?\s*(.{5,})/u, type: 'terminological', polarity: 'dont' },
    { regex: /不对[，,]?\s*(.{5,})/u, type: 'terminological', polarity: 'dont' },
    { regex: /应该\s*(.{5,})/u, type: 'procedural', polarity: 'do' },
    { regex: /以后\s*(.{5,})/u, type: 'behavioral', polarity: 'do' },
    { regex: /记住[：:]\s*(.{5,})/u, type: 'behavioral', polarity: null },
    { regex: /不要\s*(.{5,})/u, type: 'behavioral', polarity: 'dont' },
    { regex: /用\s*(\S+)\s*不用\s*(\S+)/u, type: 'terminological', polarity: 'do' },
    // Preferences
    { regex: /我喜欢\s*(.{3,})/u, type: 'behavioral', polarity: 'do' },
    { regex: /我希望\s*(.{3,})/u, type: 'behavioral', polarity: 'do' },
    { regex: /默认\s*(.{3,})/u, type: 'behavioral', polarity: 'do' },
    { regex: /尽量\s*(.{3,})/u, type: 'behavioral', polarity: 'do' },
    { regex: /别\s*(.{3,})/u, type: 'behavioral', polarity: 'dont' },
    // Decisions
    { regex: /就这样[，,]?\s*(.{3,})/u, type: 'architectural', polarity: 'do' },
    { regex: /定了[，,]?\s*(.{3,})/u, type: 'architectural', polarity: 'do' },
    { regex: /以后都\s*(.{5,})/u, type: 'behavioral', polarity: 'do' },
    { regex: /统一\s*(.{3,})/u, type: 'architectural', polarity: 'do' },
    // English patterns
    { regex: /(?:use|use)\s+(\S+)\s+(?:instead of|not)\s+(\S+)/i, type: 'terminological', polarity: 'do' },
    { regex: /(?:don't|do not)\s+(.{5,})/i, type: 'behavioral', polarity: 'dont' },
    { regex: /(?:remember|note)\s+(?:that\s+)?(.{5,})/i, type: 'behavioral', polarity: null },
    { regex: /(?:always|default to)\s+(.{5,})/i, type: 'behavioral', polarity: 'do' },
];
/**
 * Extract candidate engrams from a (user, assistant) turn pair.
 * Returns raw engrams with status='candidate'.
 */
export function extractEngramsFromTurn(userMsg, assistantMsg, existingIds = [], origin = 'hermes:telegram') {
    const results = [];
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    for (const pattern of PATTERNS) {
        const match = userMsg.match(pattern.regex);
        if (!match)
            continue;
        const statement = match[0];
        const seq = nextSequence([...existingIds, ...results.map(r => r.id)], 'raw');
        results.push({
            id: generateId('raw', seq),
            version: 1,
            layer: 'raw',
            status: 'candidate',
            consolidated: false,
            type: pattern.type,
            memory_class: 'semantic',
            polarity: pattern.polarity,
            commitment: 'exploring',
            scope: 'global',
            visibility: 'private',
            domain: 'general',
            tags: [],
            statement,
            rationale: '',
            contraindications: [],
            entities: [],
            temporal: {
                learned_at: now,
                valid_from: now,
                valid_until: null,
            },
            source: {
                episode_id: null,
                quote: userMsg.slice(0, 200),
                origin,
            },
            activation: {
                retrieval_strength: 0.8,
                storage_strength: 0.5,
                frequency: 1,
                last_accessed: today,
            },
            emotional_weight: 5,
            confidence: 5,
            associations: [],
            feedback: { positive: 0, negative: 0, neutral: 0 },
            previous_version_ref: null,
            derivation_count: 1,
        });
    }
    return results;
}
/**
 * Promote candidate to active if conditions are met.
 */
export function shouldPromote(engram, duplicateCount) {
    if (engram.status !== 'candidate')
        return false;
    // Same pattern appeared ≥2 times
    if (duplicateCount >= 2)
        return true;
    return false;
}
//# sourceMappingURL=extract.js.map