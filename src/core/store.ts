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
import { generateEpisodeId } from './id.js'
import {
  EngramSchema, ObservationSchema, MentalModelSchema,
  EpisodeSchema, GraphDataSchema, FeedbackEntrySchema,
} from './schema.js'
import { SQLiteCache } from './sqlite-cache.js'

function expandHome(p: string): string {
  return p.replace(/^~/, os.homedir())
}

function loadStoredConfig(basePath: string): Partial<FlyupMemConfig> {
  const configPath = path.join(basePath, 'config.yaml')
  if (!fs.existsSync(configPath)) return {}
  try {
    const raw = yaml.load(fs.readFileSync(configPath, 'utf-8'))
    return (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<FlyupMemConfig>
  } catch {
    return {}
  }
}

function activationValue(a: { retrieval_strength: number; storage_strength: number }): number {
  return (a.retrieval_strength + a.storage_strength) / 2
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize))
  return chunks
}

function listYamlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.yaml'))
    .sort()
    .map(name => path.join(dir, name))
}

function removeYamlFiles(dir: string): void {
  if (!fs.existsSync(dir)) return
  for (const filePath of listYamlFiles(dir)) fs.unlinkSync(filePath)
}

function sameFileContent(filePath: string, content: string): boolean {
  return fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf-8') === content
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

function stableJson(data: unknown): string {
  return JSON.stringify(data)
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function acquireLockSync(lockPath: string, timeoutMs = 5_000): () => void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  const start = Date.now()
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx')
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }))
      fs.closeSync(fd)
      return () => {
        try { fs.unlinkSync(lockPath) } catch {}
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw err
      try {
        const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs
        if (ageMs > timeoutMs * 3) {
          fs.unlinkSync(lockPath)
          continue
        }
      } catch {}
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for FlyupMem store lock: ${lockPath}`)
      }
      sleepSync(50)
    }
  }
}

function mergeBySnapshot<T extends { id: string }>(
  latest: T[],
  current: T[],
  snapshot: Map<string, string>,
): T[] {
  if (new Set(current.map(item => item.id)).size !== current.length) {
    return current
  }
  const result = new Map(latest.map(item => [item.id, item]))
  const currentIds = new Set(current.map(item => item.id))

  for (const [id] of snapshot) {
    if (!currentIds.has(id)) result.delete(id)
  }

  for (const item of current) {
    const before = snapshot.get(item.id)
    if (before === undefined || before !== stableJson(item)) {
      result.set(item.id, item)
    }
  }

  return [...result.values()]
}

export class FlyupMemStore {
  readonly basePath: string
  readonly config: FlyupMemConfig
  readonly cache: SQLiteCache

  private _engrams: Engram[] = []
  private _observations: Observation[] = []
  private _mentalModels: MentalModel[] = []
  private _episodes: Episode[] = []
  private _graph: GraphData = { entities: {}, edges: [] }
  private _feedback: FeedbackEntry[] = []
  private _loaded = false
  private _snapshots = {
    engrams: new Map<string, string>(),
    observations: new Map<string, string>(),
    mentalModels: new Map<string, string>(),
    episodes: new Map<string, string>(),
    feedback: new Map<string, string>(),
    graph: '',
  }

  constructor(config?: Partial<FlyupMemConfig>) {
    const envStorePath = process.env.FLYUPMEM_STORE_PATH
    const preliminaryConfig = {
      ...DEFAULT_CONFIG,
      ...(envStorePath ? { store_path: envStorePath } : {}),
      ...config,
    }
    const storedConfig = loadStoredConfig(expandHome(preliminaryConfig.store_path))
    this.config = {
      ...DEFAULT_CONFIG,
      ...storedConfig,
      ...(envStorePath ? { store_path: envStorePath } : {}),
      ...config,
    }
    this.basePath = expandHome(this.config.store_path)
    this.cache = new SQLiteCache({
      dbPath: path.join(this.basePath, 'index.sqlite'),
      enabled: this.config.sqlite_enabled,
    })
  }

  // ─── File paths ─────────────────────────────────────────────
  private get paths() {
    const base = this.basePath
    return {
      engrams: path.join(base, 'engrams.yaml'),
      engramChunks: path.join(base, 'engrams.d'),
      observations: path.join(base, 'observations.yaml'),
      mentalModels: path.join(base, 'mental-models.yaml'),
      episodes: path.join(base, 'episodes.yaml'),
      graph: path.join(base, 'graph.yaml'),
      feedback: path.join(base, 'feedback.yaml'),
      config: path.join(base, 'config.yaml'),
      lock: path.join(base, '.lock'),
    }
  }

  // ─── Load ───────────────────────────────────────────────────
  load(): void {
    if (this._loaded) return
    fs.mkdirSync(this.basePath, { recursive: true })
    this.reloadFromDisk()
    this._loaded = true
    this.refreshSnapshots()

    // Open SQLite cache and rebuild indexes
    try {
      this.cache.open()
      if (this.cache.isAvailable) {
        this.cache.rebuildFromData({
          engrams: this._engrams,
          observations: this._observations,
          mentalModels: this._mentalModels,
        })
      }
    } catch {
      // SQLite is optional — don't fail load if cache has issues
    }
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

  private loadEngrams(): Engram[] {
    const chunks = listYamlFiles(this.paths.engramChunks).flatMap(filePath => this.loadYaml<Engram>(filePath, EngramSchema))
    const hot = this.loadYaml<Engram>(this.paths.engrams, EngramSchema)
    // Preserve duplicate IDs so doctor can detect corrupt stores instead of silently hiding them.
    return [...chunks, ...hot]
  }

  private reloadFromDisk(): void {
    this._engrams = this.loadEngrams()
    this._observations = this.loadYaml<Observation>(this.paths.observations, ObservationSchema)
    this._mentalModels = this.loadYaml<MentalModel>(this.paths.mentalModels, MentalModelSchema)
    this._episodes = this.loadYaml<Episode>(this.paths.episodes, EpisodeSchema)
    this._graph = this.loadYamlOne<GraphData>(this.paths.graph, GraphDataSchema) ?? { entities: {}, edges: [] }
    this._feedback = this.loadYaml<FeedbackEntry>(this.paths.feedback, FeedbackEntrySchema)
  }

  withWriteLock<T>(fn: () => T): T {
    fs.mkdirSync(this.basePath, { recursive: true })
    const release = acquireLockSync(this.paths.lock)
    try {
      this.reloadFromDisk()
      this._loaded = true
      try { this.cache.open() } catch {}
      this.refreshSnapshots()
      const result = fn()
      this.writeAll()
      this.refreshSnapshots()
      return result
    } finally {
      release()
    }
  }

  // ─── Save (atomic) ─────────────────────────────────────────
  save(): void {
    fs.mkdirSync(this.basePath, { recursive: true })
    if (!this._loaded) this._loaded = true
    const release = acquireLockSync(this.paths.lock)
    try {
      this.mergeLatestFromDisk()
      this.writeAll()
      this.refreshSnapshots()
    } finally {
      release()
    }
  }

  private writeAll(): void {
    const p = this.paths
    this.writeEngrams()
    atomicWriteSync(p.observations, yaml.dump(this._observations, { lineWidth: 120, noRefs: true }))
    atomicWriteSync(p.mentalModels, yaml.dump(this._mentalModels, { lineWidth: 120, noRefs: true }))
    atomicWriteSync(p.episodes, yaml.dump(this._episodes, { lineWidth: 120, noRefs: true }))
    atomicWriteSync(p.graph, yaml.dump(this._graph, { lineWidth: 120, noRefs: true }))
    atomicWriteSync(p.feedback, yaml.dump(this._feedback, { lineWidth: 120, noRefs: true }))
  }

  private writeEngrams(): void {
    const p = this.paths
    const chunkSize = Math.max(1, this.config.max_engrams_per_file)
    if (this._engrams.length <= chunkSize) {
      const hotContent = yaml.dump(this._engrams, { lineWidth: 120, noRefs: true })
      if (!sameFileContent(p.engrams, hotContent)) atomicWriteSync(p.engrams, hotContent)
      removeYamlFiles(p.engramChunks)
      return
    }

    const hotStart = Math.max(0, this._engrams.length - chunkSize)
    const archived = this._engrams.slice(0, hotStart)
    const hot = this._engrams.slice(hotStart)
    fs.mkdirSync(p.engramChunks, { recursive: true })
    const expectedFiles = new Set<string>()
    chunkArray(archived, chunkSize).forEach((chunk, index) => {
      const fileName = `engrams-${String(index + 1).padStart(6, '0')}.yaml`
      const filePath = path.join(p.engramChunks, fileName)
      expectedFiles.add(filePath)
      const content = yaml.dump(chunk, { lineWidth: 120, noRefs: true })
      if (!sameFileContent(filePath, content)) atomicWriteSync(filePath, content)
    })
    for (const filePath of listYamlFiles(p.engramChunks)) {
      if (!expectedFiles.has(filePath)) fs.unlinkSync(filePath)
    }
    const hotContent = yaml.dump(hot, { lineWidth: 120, noRefs: true })
    if (!sameFileContent(p.engrams, hotContent)) atomicWriteSync(p.engrams, hotContent)
  }

  private refreshSnapshots(): void {
    this._snapshots.engrams = new Map(this._engrams.map(item => [item.id, stableJson(item)]))
    this._snapshots.observations = new Map(this._observations.map(item => [item.id, stableJson(item)]))
    this._snapshots.mentalModels = new Map(this._mentalModels.map(item => [item.id, stableJson(item)]))
    this._snapshots.episodes = new Map(this._episodes.map(item => [item.id, stableJson(item)]))
    this._snapshots.feedback = new Map(this._feedback.map(item => [item.id, stableJson(item)]))
    this._snapshots.graph = stableJson(this._graph)
  }

  private mergeLatestFromDisk(): void {
    const latestEngrams = this.loadEngrams()
    const latestObservations = this.loadYaml<Observation>(this.paths.observations, ObservationSchema)
    const latestMentalModels = this.loadYaml<MentalModel>(this.paths.mentalModels, MentalModelSchema)
    const latestEpisodes = this.loadYaml<Episode>(this.paths.episodes, EpisodeSchema)
    const latestFeedback = this.loadYaml<FeedbackEntry>(this.paths.feedback, FeedbackEntrySchema)
    const latestGraph = this.loadYamlOne<GraphData>(this.paths.graph, GraphDataSchema) ?? { entities: {}, edges: [] }

    this._engrams = mergeBySnapshot(latestEngrams, this._engrams, this._snapshots.engrams)
    this._observations = mergeBySnapshot(latestObservations, this._observations, this._snapshots.observations)
    this._mentalModels = mergeBySnapshot(latestMentalModels, this._mentalModels, this._snapshots.mentalModels)
    this._episodes = mergeBySnapshot(latestEpisodes, this._episodes, this._snapshots.episodes)
    this._feedback = mergeBySnapshot(latestFeedback, this._feedback, this._snapshots.feedback)
    this._graph = this._snapshots.graph === stableJson(this._graph) ? latestGraph : this._graph
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
    this.cache.syncEngram(engram)
  }

  updateEngram(id: string, updates: Partial<Engram>): void {
    const idx = this._engrams.findIndex(e => e.id === id)
    if (idx >= 0) {
      this._engrams[idx] = { ...this._engrams[idx], ...updates }
      this.cache.syncEngram(this._engrams[idx])
    }
  }

  updateActivationCacheOnly(mem: Memory): void {
    if (!mem.activation) return
    if (!this.cache.metaGet(mem.id)) {
      if ('consolidated' in mem) this.cache.syncEngram(mem)
      else if (mem.layer === 'observation') this.cache.syncObservation(mem)
      else if (mem.layer === 'mental_model') this.cache.syncMentalModel(mem)
      return
    }
    this.cache.updateActivation(mem.id, activationValue(mem.activation), mem.activation.last_accessed)
  }

  removeEngram(id: string): void {
    this._engrams = this._engrams.filter(e => e.id !== id)
    this.cache.removeItem(id)
  }

  addObservation(obs: Observation): void {
    this._observations.push(obs)
    this.cache.syncObservation(obs)
  }

  updateObservation(id: string, updates: Partial<Observation>): void {
    const idx = this._observations.findIndex(o => o.id === id)
    if (idx >= 0) {
      this._observations[idx] = { ...this._observations[idx], ...updates }
      this.cache.syncObservation(this._observations[idx])
    }
  }

  removeObservation(id: string): void {
    this._observations = this._observations.filter(o => o.id !== id)
    this.cache.removeItem(id)
  }

  addMentalModel(mm: MentalModel): void {
    this._mentalModels.push(mm)
    this.cache.syncMentalModel(mm)
  }

  updateMentalModel(id: string, updates: Partial<MentalModel>): void {
    const idx = this._mentalModels.findIndex(m => m.id === id)
    if (idx >= 0) {
      this._mentalModels[idx] = { ...this._mentalModels[idx], ...updates }
      this.cache.syncMentalModel(this._mentalModels[idx])
    }
  }

  removeMentalModel(id: string): void {
    this._mentalModels = this._mentalModels.filter(m => m.id !== id)
    this.cache.removeItem(id)
  }

  addEpisode(ep: Episode): void {
    this._episodes.push(ep)
  }

  captureEpisodeSummary(
    userMsg: string,
    assistantMsg: string,
    createdEngramIds: string[] = [],
    meta: Partial<Pick<Episode, 'agent' | 'channel' | 'scope' | 'tags' | 'kind'>> = {},
  ): Episode {
    const summary = summarizeTurn(userMsg, assistantMsg)
    const episode: Episode = {
      id: generateEpisodeId(),
      kind: meta.kind ?? 'turn',
      timestamp: new Date().toISOString(),
      agent: meta.agent ?? 'unknown',
      channel: meta.channel ?? 'unknown',
      scope: meta.scope ?? 'global',
      summary,
      tags: meta.tags ?? [],
      created_engram_ids: createdEngramIds,
      context: [userMsg, assistantMsg].filter(Boolean).join('\n---\n').slice(0, 1000),
    }
    this.addEpisode(episode)
    return episode
  }

  captureCheckpoint(label: string, data: { summary?: string; next_steps?: string[]; context?: string; tags?: string[] } = {}): Episode {
    const episode: Episode = {
      id: generateEpisodeId(),
      kind: 'checkpoint',
      timestamp: new Date().toISOString(),
      agent: 'checkpoint',
      channel: 'system',
      scope: 'global',
      summary: data.summary ?? label,
      tags: ['checkpoint', ...(data.tags ?? [])],
      created_engram_ids: [],
      checkpoint_label: label,
      next_steps: data.next_steps ?? [],
      context: data.context,
    }
    this.addEpisode(episode)
    return episode
  }

  getRecoveryContext(limit = 5): string {
    this.load()
    const recent = [...this._episodes]
      .filter(ep => ep.kind === 'summary' || ep.kind === 'checkpoint' || ep.kind === 'turn')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
    if (recent.length === 0) return ''
    const lines = ['### Recent FlyupMem Session Context']
    for (const ep of recent.reverse()) {
      const label = ep.kind === 'checkpoint' && ep.checkpoint_label ? `checkpoint:${ep.checkpoint_label}` : (ep.kind ?? 'turn')
      lines.push(`- [${ep.timestamp.slice(0, 16)} ${label}] ${ep.summary}`)
      if (ep.next_steps?.length) lines.push(`  next: ${ep.next_steps.slice(0, 3).join('; ')}`)
    }
    return lines.join('\n')
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

function summarizeTurn(userMsg: string, assistantMsg: string): string {
  const user = userMsg.replace(/\s+/g, ' ').trim()
  const assistant = assistantMsg.replace(/\s+/g, ' ').trim()
  if (user && assistant) return `User: ${user.slice(0, 140)} | Assistant: ${assistant.slice(0, 140)}`
  return (user || assistant || 'Empty turn').slice(0, 280)
}
