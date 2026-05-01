// src/core/store.ts — FlyupMemStore: YAML-first storage with atomic writes
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';
import { DEFAULT_CONFIG } from './types.js';
import { EngramSchema, ObservationSchema, MentalModelSchema, EpisodeSchema, GraphDataSchema, FeedbackEntrySchema, } from './schema.js';
function expandHome(p) {
    return p.replace(/^~/, os.homedir());
}
/**
 * Atomic write: write to tmp file, then rename.
 */
function atomicWriteSync(filePath, data) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, data, 'utf-8');
    fs.renameSync(tmp, filePath);
}
export class FlyupMemStore {
    basePath;
    config;
    _engrams = [];
    _observations = [];
    _mentalModels = [];
    _episodes = [];
    _graph = { entities: {}, edges: [] };
    _feedback = [];
    _loaded = false;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.basePath = expandHome(this.config.store_path);
    }
    // ─── File paths ─────────────────────────────────────────────
    get paths() {
        const base = this.basePath;
        return {
            engrams: path.join(base, 'engrams.yaml'),
            observations: path.join(base, 'observations.yaml'),
            mentalModels: path.join(base, 'mental-models.yaml'),
            episodes: path.join(base, 'episodes.yaml'),
            graph: path.join(base, 'graph.yaml'),
            feedback: path.join(base, 'feedback.yaml'),
            config: path.join(base, 'config.yaml'),
        };
    }
    // ─── Load ───────────────────────────────────────────────────
    load() {
        if (this._loaded)
            return;
        fs.mkdirSync(this.basePath, { recursive: true });
        this._engrams = this.loadYaml(this.paths.engrams, EngramSchema);
        this._observations = this.loadYaml(this.paths.observations, ObservationSchema);
        this._mentalModels = this.loadYaml(this.paths.mentalModels, MentalModelSchema);
        this._episodes = this.loadYaml(this.paths.episodes, EpisodeSchema);
        this._graph = this.loadYamlOne(this.paths.graph, GraphDataSchema) ?? { entities: {}, edges: [] };
        this._feedback = this.loadYaml(this.paths.feedback, FeedbackEntrySchema);
        this._loaded = true;
    }
    loadYaml(filePath, schema) {
        if (!fs.existsSync(filePath))
            return [];
        try {
            const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'));
            if (!Array.isArray(raw))
                return [];
            // Validate each entry, skip invalid ones
            const valid = [];
            for (const item of raw) {
                const result = schema.safeParse(item);
                if (result.success)
                    valid.push(result.data);
            }
            return valid;
        }
        catch {
            return [];
        }
    }
    loadYamlOne(filePath, schema) {
        if (!fs.existsSync(filePath))
            return null;
        try {
            const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'));
            const result = schema.safeParse(raw);
            return result.success ? result.data : null;
        }
        catch {
            return null;
        }
    }
    // ─── Save (atomic) ─────────────────────────────────────────
    save() {
        const p = this.paths;
        atomicWriteSync(p.engrams, yaml.dump(this._engrams, { lineWidth: 120, noRefs: true }));
        atomicWriteSync(p.observations, yaml.dump(this._observations, { lineWidth: 120, noRefs: true }));
        atomicWriteSync(p.mentalModels, yaml.dump(this._mentalModels, { lineWidth: 120, noRefs: true }));
        atomicWriteSync(p.episodes, yaml.dump(this._episodes, { lineWidth: 120, noRefs: true }));
        atomicWriteSync(p.graph, yaml.dump(this._graph, { lineWidth: 120, noRefs: true }));
        atomicWriteSync(p.feedback, yaml.dump(this._feedback, { lineWidth: 120, noRefs: true }));
    }
    // ─── Accessors ──────────────────────────────────────────────
    get engrams() { return this._engrams; }
    get observations() { return this._observations; }
    get mentalModels() { return this._mentalModels; }
    get episodes() { return this._episodes; }
    get graph() { return this._graph; }
    get feedback() { return this._feedback; }
    allMemories() {
        return [
            ...this._mentalModels,
            ...this._observations,
            ...this._engrams,
        ];
    }
    getById(id) {
        return this.allMemories().find(m => m.id === id);
    }
    getEngramById(id) {
        return this._engrams.find(e => e.id === id);
    }
    // ─── Mutations ──────────────────────────────────────────────
    addEngram(engram) {
        this._engrams.push(engram);
    }
    updateEngram(id, updates) {
        const idx = this._engrams.findIndex(e => e.id === id);
        if (idx >= 0) {
            this._engrams[idx] = { ...this._engrams[idx], ...updates };
        }
    }
    addObservation(obs) {
        this._observations.push(obs);
    }
    addMentalModel(mm) {
        this._mentalModels.push(mm);
    }
    addEpisode(ep) {
        this._episodes.push(ep);
    }
    addFeedback(fb) {
        this._feedback.push(fb);
    }
    addEdge(from, to, type, weight) {
        this._graph.edges.push({ from, to, type, weight });
    }
    addEntity(name, type, memoryId) {
        if (!this._graph.entities[name]) {
            this._graph.entities[name] = { type, memory_ids: [] };
        }
        if (!this._graph.entities[name].memory_ids.includes(memoryId)) {
            this._graph.entities[name].memory_ids.push(memoryId);
        }
    }
    /**
     * Find engram by content hash (exact dedup).
     */
    findByHash(hash) {
        return this._engrams.find(e => e.content_hash === hash);
    }
    /**
     * Count feedback signals for a memory within last N days.
     */
    countRecentFeedback(memoryId, signal, days) {
        const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
        return this._feedback.filter(fb => fb.memory_id === memoryId && fb.signal === signal && fb.created_at >= cutoff).length;
    }
    // ─── Health check ───────────────────────────────────────────
    healthCheck() {
        const issues = [];
        if (!fs.existsSync(this.basePath))
            issues.push(`Store path does not exist: ${this.basePath}`);
        if (!this._loaded)
            issues.push('Store not loaded');
        // Check for duplicate IDs
        const ids = this.allMemories().map(m => m.id);
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        if (dupes.length > 0)
            issues.push(`Duplicate IDs: ${dupes.join(', ')}`);
        return { ok: issues.length === 0, issues };
    }
    // ─── Stats ──────────────────────────────────────────────────
    stats() {
        return {
            engrams: {
                total: this._engrams.length,
                active: this._engrams.filter(e => e.status === 'active').length,
                candidate: this._engrams.filter(e => e.status === 'candidate').length,
                fading: this._engrams.filter(e => e.status === 'fading').length,
                dormant: this._engrams.filter(e => e.status === 'dormant').length,
                retired: this._engrams.filter(e => e.status === 'retired').length,
                locked: this._engrams.filter(e => e.status === 'locked').length,
            },
            observations: this._observations.length,
            mentalModels: this._mentalModels.length,
            episodes: this._episodes.length,
            graphEntities: Object.keys(this._graph.entities).length,
            graphEdges: this._graph.edges.length,
            feedback: this._feedback.length,
        };
    }
}
//# sourceMappingURL=store.js.map