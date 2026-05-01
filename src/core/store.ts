// src/core/store.ts — FlyupMemStore: YAML-first storage with atomic writes

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as yaml from 'js-yaml'
import type {
  Engram, Observation, MentalModel, Episode,
  GraphData, FeedbackEntry, Memory, FlyupMemConfig,
} from './types.js'
import { DEFAULT_CONFIG } from './types.js'
import {
  EngramSchema, ObservationSchema, MentalModelSchema,
  EpisodeSchema, GraphDataSchema, FeedbackEntrySchema,
} from './schema.js'

function expandHome(p: string): string {
  return p.replace(/^~/, os.homedir())
}

/**
 * Atomic write: write to tmp file, then rename.
 */
function atomicWriteSync(filePath: string, data: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = filePath + '.tmp.' + process.pid
  fs.writeFileSync(tmp, data, 'utf-8')
  fs.renameSync(tmp, filePath)
}

export class FlyupMemStore {
  readonly basePath: string
  readonly config: FlyupMemConfig

  private _engrams: Engram[] = []
  private _observations: Observation[] = []
  private _mentalModels: MentalModel[] = []
  private _episodes: Episode[] = []
  private _graph: GraphData = { entities: {}, edges: [] }
  private _feedback: FeedbackEntry[] = []
  private _loaded = false

  constructor(config?: Partial<FlyupMemConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.basePath = expandHome(this.config.store_path)
  }

  // ─── File paths ─────────────────────────────────────────────
  private get paths() {
    const base = this.basePath
    return {
      engrams: path.join(base, 'engrams.yaml'),
      observations: path.join(base, 'observations.yaml'),
      mentalModels: path.join(base, 'mental-models.yaml'),
      episodes: path.join(base, 'episodes.yaml'),
      graph: path.join(base, 'graph.yaml'),
      feedback: path.join(base, 'feedback.yaml'),
      config: path.join(base, 'config.yaml'),
    }
  }

  // ─── Load ───────────────────────────────────────────────────
  load(): void {
    if (this._loaded) return
    fs.mkdirSync(this.basePath, { recursive: true })
    this._engrams = this.loadYaml<Engram>(this.paths.engrams, EngramSchema)
    this._observations = this.loadYaml<Observation>(this.paths.observations, ObservationSchema)
    this._mentalModels = this.loadYaml<MentalModel>(this.paths.mentalModels, MentalModelSchema)
    this._episodes = this.loadYaml<Episode>(this.paths.episodes, EpisodeSchema)
    this._graph = this.loadYamlOne<GraphData>(this.paths.graph, GraphDataSchema) ?? { entities: {}, edges: [] }
    this._feedback = this.loadYaml<FeedbackEntry>(this.paths.feedback, FeedbackEntrySchema)
    this._loaded = true
  }

  private loadYaml<T>(filePath: string, schema: { safeParse: (data: unknown) => { success: boolean; data?: T } }): T[] {
    if (!fs.existsSync(filePath)) return []
    try {
      const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'))
      if (!Array.isArray(raw)) return []
      // Validate each entry, skip invalid ones
      const valid: T[] = []
      for (const item of raw) {
        const result = schema.safeParse(item)
        if (result.success) valid.push(result.data as T)
      }
      return valid
    } catch {
      return []
    }
  }

  private loadYamlOne<T>(filePath: string, schema: { safeParse: (data: unknown) => { success: boolean; data?: T } }): T | null {
    if (!fs.existsSync(filePath)) return null
    try {
      const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'))
      const result = schema.safeParse(raw)
      return result.success ? (result.data as T) : null
    } catch {
      return null
    }
  }

  // ─── Save (atomic) ─────────────────────────────────────────
  save(): void {
    const p = this.paths
    atomicWriteSync(p.engrams, yaml.dump(this._engrams, { lineWidth: 120, noRefs: true }))
    atomicWriteSync(p.observations, yaml.dump(this._observations, { lineWidth: 120, noRefs: true }))
    atomicWriteSync(p.mentalModels, yaml.dump(this._mentalModels, { lineWidth: 120, noRefs: true }))
    atomicWriteSync(p.episodes, yaml.dump(this._episodes, { lineWidth: 120, noRefs: true }))
    atomicWriteSync(p.graph, yaml.dump(this._graph, { lineWidth: 120, noRefs: true }))
    atomicWriteSync(p.feedback, yaml.dump(this._feedback, { lineWidth: 120, noRefs: true }))
  }

  // ─── Accessors ──────────────────────────────────────────────
  get engrams(): Engram[] { return this._engrams }
  get observations(): Observation[] { return this._observations }
  get mentalModels(): MentalModel[] { return this._mentalModels }
  get episodes(): Episode[] { return this._episodes }
  get graph(): GraphData { return this._graph }
  get feedback(): FeedbackEntry[] { return this._feedback }

  allMemories(): Memory[] {
    return [
      ...this._mentalModels,
      ...this._observations,
      ...this._engrams,
    ]
  }

  getById(id: string): Memory | undefined {
    return this.allMemories().find(m => m.id === id)
  }

  getEngramById(id: string): Engram | undefined {
    return this._engrams.find(e => e.id === id)
  }

  // ─── Mutations ──────────────────────────────────────────────
  addEngram(engram: Engram): void {
    this._engrams.push(engram)
  }

  updateEngram(id: string, updates: Partial<Engram>): void {
    const idx = this._engrams.findIndex(e => e.id === id)
    if (idx >= 0) {
      this._engrams[idx] = { ...this._engrams[idx], ...updates }
    }
  }

  addObservation(obs: Observation): void {
    this._observations.push(obs)
  }

  addMentalModel(mm: MentalModel): void {
    this._mentalModels.push(mm)
  }

  addEpisode(ep: Episode): void {
    this._episodes.push(ep)
  }

  addFeedback(fb: FeedbackEntry): void {
    this._feedback.push(fb)
  }

  addEdge(from: string, to: string, type: GraphData['edges'][0]['type'], weight: number): void {
    this._graph.edges.push({ from, to, type, weight })
  }

  addEntity(name: string, type: string, memoryId: string): void {
    if (!this._graph.entities[name]) {
      this._graph.entities[name] = { type, memory_ids: [] }
    }
    if (!this._graph.entities[name].memory_ids.includes(memoryId)) {
      this._graph.entities[name].memory_ids.push(memoryId)
    }
  }

  /**
   * Find engram by content hash (exact dedup).
   */
  findByHash(hash: string): Engram | undefined {
    return this._engrams.find(e => e.content_hash === hash)
  }

  /**
   * Count feedback signals for a memory within last N days.
   */
  countRecentFeedback(memoryId: string, signal: FeedbackEntry['signal'], days: number): number {
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString()
    return this._feedback.filter(
      fb => fb.memory_id === memoryId && fb.signal === signal && fb.created_at >= cutoff
    ).length
  }

  // ─── Health check ───────────────────────────────────────────
  healthCheck(): { ok: boolean; issues: string[] } {
    const issues: string[] = []
    if (!fs.existsSync(this.basePath)) issues.push(`Store path does not exist: ${this.basePath}`)
    if (!this._loaded) issues.push('Store not loaded')
    // Check for duplicate IDs
    const ids = this.allMemories().map(m => m.id)
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (dupes.length > 0) issues.push(`Duplicate IDs: ${dupes.join(', ')}`)
    return { ok: issues.length === 0, issues }
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
    }
  }
}
