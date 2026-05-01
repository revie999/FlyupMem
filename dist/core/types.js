// src/core/types.ts — Core type definitions for FlyupMem
export const LAYER_ORDER = {
    mental_model: 1,
    observation: 2,
    raw: 3,
    experience: 4,
};
export const DEFAULT_CONFIG = {
    store_path: '~/.flyupmem',
    max_engrams_per_file: 5000,
    max_file_size_mb: 5,
    decay_enabled: true,
    consolidation_enabled: true,
    embedding_enabled: false,
    log_level: 'info',
};
//# sourceMappingURL=types.js.map