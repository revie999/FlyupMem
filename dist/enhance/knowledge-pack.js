// src/enhance/knowledge-pack.ts — Knowledge Pack export/import
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
/**
 * Export all memories as a Knowledge Pack (JSON or YAML).
 */
export function exportKnowledgePack(store, format = 'yaml') {
    store.load();
    const pack = {
        version: '0.3.0',
        exported_at: new Date().toISOString(),
        source: store.basePath,
        stats: {
            engrams: store.engrams.length,
            observations: store.observations.length,
            mental_models: store.mentalModels.length,
        },
        engrams: store.engrams,
        observations: store.observations,
        mental_models: store.mentalModels,
    };
    if (format === 'json') {
        return JSON.stringify(pack, null, 2);
    }
    return yaml.dump(pack, { lineWidth: 120, noRefs: true });
}
/**
 * Export Knowledge Pack to a file.
 */
export function exportKnowledgePackToFile(store, filePath, format) {
    const ext = path.extname(filePath);
    const fmt = format ?? (ext === '.json' ? 'json' : 'yaml');
    const content = exportKnowledgePack(store, fmt);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
}
/**
 * Import memories from a Knowledge Pack.
 * Skips duplicates by content_hash.
 */
export function importKnowledgePack(store, packContent, format = 'yaml') {
    store.load();
    let pack;
    try {
        pack = format === 'json'
            ? JSON.parse(packContent)
            : yaml.load(packContent);
    }
    catch (err) {
        return { imported: 0, skipped: 0, errors: 1 };
    }
    let imported = 0;
    let skipped = 0;
    // Import engrams (skip duplicates)
    for (const eng of pack.engrams ?? []) {
        if (store.findByHash(eng.content_hash)) {
            skipped++;
            continue;
        }
        store.addEngram(eng);
        imported++;
    }
    // Import observations (skip by ID)
    for (const obs of pack.observations ?? []) {
        if (store.observations.some(o => o.id === obs.id)) {
            skipped++;
            continue;
        }
        store.addObservation(obs);
        imported++;
    }
    // Import mental models (skip by ID)
    for (const mm of pack.mental_models ?? []) {
        if (store.mentalModels.some(m => m.id === mm.id)) {
            skipped++;
            continue;
        }
        store.addMentalModel(mm);
        imported++;
    }
    if (imported > 0) {
        store.save();
    }
    return { imported, skipped, errors: 0 };
}
/**
 * Import from a file path.
 */
export function importKnowledgePackFromFile(store, filePath) {
    if (!fs.existsSync(filePath)) {
        return { imported: 0, skipped: 0, errors: 1 };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath);
    const format = ext === '.json' ? 'json' : 'yaml';
    return importKnowledgePack(store, content, format);
}
//# sourceMappingURL=knowledge-pack.js.map