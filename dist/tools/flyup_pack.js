// src/tools/flyup_pack.ts — Knowledge Pack export/import tool
import { exportKnowledgePackToFile, importKnowledgePackFromFile, } from '../enhance/knowledge-pack.js';
/**
 * Export or import a Knowledge Pack.
 */
export function flyupPack(action, filePath, store) {
    store.load();
    if (action === 'export') {
        try {
            exportKnowledgePackToFile(store, filePath);
            return {
                action: 'export',
                success: true,
                details: `Exported ${store.engrams.length} engrams, ${store.observations.length} observations, ${store.mentalModels.length} mental models to ${filePath}`,
            };
        }
        catch (err) {
            return { action: 'export', success: false, details: err.message };
        }
    }
    // Import
    const result = importKnowledgePackFromFile(store, filePath);
    return {
        action: 'import',
        success: result.errors === 0,
        details: `Imported: ${result.imported}, Skipped (duplicates): ${result.skipped}, Errors: ${result.errors}`,
    };
}
//# sourceMappingURL=flyup_pack.js.map