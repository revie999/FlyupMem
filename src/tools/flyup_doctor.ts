// src/tools/flyup_doctor.ts — Deep health check for FlyupMem store

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { FlyupMemStore } from '../core/store.js'
import type { Memory } from '../core/types.js'
import { initEmbedder, isEmbeddingAvailable } from '../search/embed.js'
import { CURRENT_STORE_SCHEMA_VERSION, flyupMigrate, loadStoreSchemaMetaStrict, missingMigrationIds } from './flyup_migrate.js'

export interface DoctorResult {
  overall: 'healthy' | 'warning' | 'error'
  checks: DoctorCheck[]
  repairs?: DoctorRepair[]
}

export interface DoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  details?: string[]
}

export interface DoctorRepair {
  name: string
  status: 'repaired' | 'skipped' | 'failed'
  message: string
  details?: string[]
}

export interface DoctorOptions {
  repair?: boolean
  staleLockMs?: number
}

/**
 * Deep health check: validates store integrity, YAML parsability,
 * ID uniqueness, graph consistency, and embedding availability.
 */
export async function flyupDoctor(store: FlyupMemStore, options: DoctorOptions = {}): Promise<DoctorResult> {
  const repairs = options.repair ? runRepairs(store, options) : undefined
  const checks: DoctorCheck[] = []
  const basePath = store.basePath

  // ─── 1. Store path exists & writable ──────────────────────
  checks.push(checkStorePath(basePath))

  // ─── 2. YAML files parseable ──────────────────────────────
  checks.push(checkYamlFiles(basePath))

  // ─── 3. Zod schema validation (via store.load) ───────────
  checks.push(checkSchemaValidation(store))

  // ─── 4. Store schema version ─────────────────────────────
  checks.push(checkSchemaVersion(basePath))

  // ─── 5. Duplicate ID check ───────────────────────────────
  checks.push(checkDuplicateIds(store))

  // ─── 6. Graph integrity ──────────────────────────────────
  checks.push(checkGraphIntegrity(store))

  // ─── 7. Temporal consistency ─────────────────────────────
  checks.push(checkTemporalConsistency(store))

  // ─── 8. Activation range ─────────────────────────────────
  checks.push(checkActivationRange(store))

  // ─── 9. Embedding availability ───────────────────────────
  checks.push(await checkEmbedding())

  // ─── 10. File size warnings ──────────────────────────────
  checks.push(checkFileSizes(basePath))

  // ─── 11. Hermes plugin link ──────────────────────────────
  checks.push(checkHermesPlugin())

  // ─── Compute overall ─────────────────────────────────────
  const hasFail = checks.some(c => c.status === 'fail')
  const hasWarn = checks.some(c => c.status === 'warn')
  const overall = hasFail ? 'error' : hasWarn ? 'warning' : 'healthy'

  return { overall, checks, repairs }
}

// ─── Individual checks ────────────────────────────────────────

function checkStorePath(basePath: string): DoctorCheck {
  try {
    if (!fs.existsSync(basePath)) {
      return { name: 'store-path', status: 'fail', message: `Store path does not exist: ${basePath}` }
    }
    // Try writing a temp file to verify write access
    const testFile = path.join(basePath, '.doctor-write-test')
    fs.writeFileSync(testFile, 'test', 'utf-8')
    fs.unlinkSync(testFile)
    return { name: 'store-path', status: 'pass', message: `Store path exists and writable: ${basePath}` }
  } catch (err) {
    return { name: 'store-path', status: 'fail', message: `Store path not writable: ${basePath}`, details: [String(err)] }
  }
}

function checkYamlFiles(basePath: string): DoctorCheck {
  const yamlFiles = yamlFilePaths(basePath)
  const issues: string[] = []
  const parsed: string[] = []

  for (const fp of yamlFiles) {
    if (!fs.existsSync(fp)) continue
    const file = path.relative(basePath, fp)
    try {
      const raw = fs.readFileSync(fp, 'utf-8')
      yaml.load(raw)
      parsed.push(file)
    } catch (err) {
      issues.push(`${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (issues.length > 0) {
    return { name: 'yaml-parsing', status: 'fail', message: `${issues.length} YAML file(s) failed to parse`, details: issues }
  }
  return { name: 'yaml-parsing', status: 'pass', message: `${parsed.length} YAML file(s) parsed successfully` }
}

function checkSchemaValidation(store: FlyupMemStore): DoctorCheck {
  // store.load() already validates via Zod and silently skips invalid entries
  // We reload and count what's present vs what was in the raw YAML
  store.load()
  const basePath = store.basePath

  let rawCount = 0
  let validCount = 0
  const skipped: string[] = []

  const filePairs: Array<[string, 'engrams' | 'observations' | 'mentalModels' | 'episodes' | 'feedback']> = [
    ['engrams.yaml', 'engrams'],
    ['observations.yaml', 'observations'],
    ['mental-models.yaml', 'mentalModels'],
    ['episodes.yaml', 'episodes'],
    ['feedback.yaml', 'feedback'],
  ]

  for (const [file, accessor] of filePairs) {
    const fp = path.join(basePath, file)
    if (!fs.existsSync(fp)) continue
    try {
      const raw = yaml.load(fs.readFileSync(fp, 'utf-8'))
      if (Array.isArray(raw)) {
        rawCount += raw.length
      }
    } catch { /* already caught by yaml-parsing check */ }
  }
  const chunkDir = path.join(basePath, 'engrams.d')
  if (fs.existsSync(chunkDir)) {
    for (const name of fs.readdirSync(chunkDir)) {
      if (!name.endsWith('.yaml')) continue
      try {
        const raw = yaml.load(fs.readFileSync(path.join(chunkDir, name), 'utf-8'))
        if (Array.isArray(raw)) rawCount += raw.length
      } catch { /* already caught by yaml-parsing check */ }
    }
  }

  validCount = store.engrams.length + store.observations.length +
    store.mentalModels.length + store.episodes.length + store.feedback.length

  const skippedCount = rawCount - validCount
  if (skippedCount > 0) {
    return {
      name: 'schema-validation',
      status: 'warn',
      message: `${skippedCount} entry/entries skipped due to schema validation`,
      details: [`${validCount}/${rawCount} entries valid`],
    }
  }
  return { name: 'schema-validation', status: 'pass', message: `All ${validCount} entries pass schema validation` }
}

function checkSchemaVersion(basePath: string): DoctorCheck {
  const loaded = loadStoreSchemaMetaStrict(basePath)
  if (!loaded.ok) {
    return {
      name: 'schema-version',
      status: 'fail',
      message: 'schema.yaml is invalid',
      details: ['error' in loaded ? loaded.error : 'schema.yaml failed validation'],
    }
  }

  const meta = loaded.meta
  const missingIds = missingMigrationIds(meta)
  if (meta.schema_version > CURRENT_STORE_SCHEMA_VERSION) {
    return {
      name: 'schema-version',
      status: 'warn',
      message: `Store schema v${meta.schema_version} is newer than this CLI supports (v${CURRENT_STORE_SCHEMA_VERSION})`,
      details: ['Upgrade FlyupMem before running migrations or repairs'],
    }
  }
  if (meta.schema_version < CURRENT_STORE_SCHEMA_VERSION) {
    return {
      name: 'schema-version',
      status: 'warn',
      message: `Store schema v${meta.schema_version} is behind current v${CURRENT_STORE_SCHEMA_VERSION}`,
      details: ['Run: flyupmem migrate --apply'],
    }
  }
  if (missingIds.length > 0) {
    return {
      name: 'schema-version',
      status: 'warn',
      message: `Store schema v${meta.schema_version} is missing ${missingIds.length} migration marker(s)`,
      details: [`missing migrations: ${missingIds.join(', ')}`, 'Run: flyupmem migrate --apply'],
    }
  }
  return {
    name: 'schema-version',
    status: 'pass',
    message: `Store schema v${meta.schema_version} is current`,
  }
}

function checkDuplicateIds(store: FlyupMemStore): DoctorCheck {
  const all = store.allMemories()
  const ids = all.map(m => m.id)
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const id of ids) {
    if (seen.has(id)) {
      if (!dupes.includes(id)) dupes.push(id)
    } else {
      seen.add(id)
    }
  }

  if (dupes.length > 0) {
    return { name: 'unique-ids', status: 'fail', message: `Duplicate IDs found: ${dupes.join(', ')}` }
  }
  return { name: 'unique-ids', status: 'pass', message: `All ${all.length} memory IDs are unique` }
}

function checkGraphIntegrity(store: FlyupMemStore): DoctorCheck {
  store.load()
  const graph = store.graph
  const allIds = new Set(store.allMemories().map(m => m.id))
  const issues: string[] = []

  // Check edges reference existing memory IDs
  for (const edge of graph.edges) {
    if (!allIds.has(edge.from)) issues.push(`Edge references missing memory: from=${edge.from}`)
    if (!allIds.has(edge.to)) issues.push(`Edge references missing memory: to=${edge.to}`)
  }

  // Check entity memory_ids reference existing memories
  for (const [name, entity] of Object.entries(graph.entities)) {
    for (const mid of entity.memory_ids) {
      if (!allIds.has(mid)) {
        issues.push(`Entity "${name}" references missing memory: ${mid}`)
      }
    }
  }

  if (issues.length > 0) {
    return { name: 'graph-integrity', status: 'warn', message: `${issues.length} graph issue(s) found`, details: issues.slice(0, 10) }
  }
  const totalEdges = graph.edges.length
  const totalEntities = Object.keys(graph.entities).length
  return {
    name: 'graph-integrity',
    status: 'pass',
    message: `Graph OK: ${totalEntities} entities, ${totalEdges} edges`,
  }
}

function checkTemporalConsistency(store: FlyupMemStore): DoctorCheck {
  const issues: string[] = []
  for (const e of store.engrams) {
    if (e.temporal.learned_at > e.temporal.valid_from) {
      issues.push(`${e.id}: learned_at (${e.temporal.learned_at}) > valid_from (${e.temporal.valid_from})`)
    }
  }
  if (issues.length > 0) {
    return { name: 'temporal', status: 'warn', message: `${issues.length} temporal inconsistency/ies`, details: issues.slice(0, 10) }
  }
  return { name: 'temporal', status: 'pass', message: 'All temporal fields consistent' }
}

function checkActivationRange(store: FlyupMemStore): DoctorCheck {
  const issues: string[] = []
  for (const m of store.allMemories()) {
    const a = m.activation
    if (a.retrieval_strength < 0 || a.retrieval_strength > 1) {
      issues.push(`${m.id}: retrieval_strength=${a.retrieval_strength} (out of [0,1])`)
    }
    if (a.storage_strength < 0 || a.storage_strength > 1) {
      issues.push(`${m.id}: storage_strength=${a.storage_strength} (out of [0,1])`)
    }
  }
  if (issues.length > 0) {
    return { name: 'activation-range', status: 'warn', message: `${issues.length} activation value(s) out of range`, details: issues.slice(0, 10) }
  }
  return { name: 'activation-range', status: 'pass', message: 'All activation values in valid range' }
}

async function checkEmbedding(): Promise<DoctorCheck> {
  // Attempt to initialize (lazy load) — model is only loaded on first call
  try {
    await initEmbedder({ timeoutMs: 10_000, forceRetry: false })
  } catch { /* swallow timeout/init errors, fall through to warn */ }
  const available = isEmbeddingAvailable()
  if (available) {
    return { name: 'embedding', status: 'pass', message: 'BGE-m3 embedding model available' }
  }
  return { name: 'embedding', status: 'warn', message: 'Embedding model not loaded (semantic search unavailable)' }
}

function checkFileSizes(basePath: string): DoctorCheck {
  const limits: Array<[string, number]> = [
    ['engrams.yaml', 5 * 1024 * 1024],
    ['observations.yaml', 2 * 1024 * 1024],
    ['mental-models.yaml', 1 * 1024 * 1024],
  ]
  const warnings: string[] = []

  for (const [file, maxBytes] of limits) {
    const fp = path.join(basePath, file)
    if (!fs.existsSync(fp)) continue
    const size = fs.statSync(fp).size
    if (size > maxBytes) {
      warnings.push(`${file}: ${(size / 1024 / 1024).toFixed(1)}MB (threshold: ${(maxBytes / 1024 / 1024).toFixed(0)}MB)`)
    }
  }

  if (warnings.length > 0) {
    return { name: 'file-size', status: 'warn', message: 'Some files exceed recommended size', details: warnings }
  }
  return { name: 'file-size', status: 'pass', message: 'All files within size limits' }
}

function checkHermesPlugin(): DoctorCheck {
  const pluginLink = path.join(
    process.env.HOME ?? '~',
    '.hermes', 'plugins', 'flyupmem',
  )
  if (fs.existsSync(pluginLink)) {
    const target = fs.readlinkSync(pluginLink)
    return { name: 'hermes-plugin', status: 'pass', message: `Hermes plugin linked: ${target}` }
  }
  return { name: 'hermes-plugin', status: 'warn', message: 'Hermes plugin not linked (optional)' }
}

// ─── Safe repairs ─────────────────────────────────────────────

function runRepairs(store: FlyupMemStore, options: DoctorOptions): DoctorRepair[] {
  const repairs: DoctorRepair[] = []

  repairs.push(repairStaleLock(store.basePath, options.staleLockMs ?? 15 * 60_000))
  const yamlIssues = yamlParseIssues(store.basePath)
  if (yamlIssues.length > 0) {
    repairs.push({
      name: 'yaml-dependent-repairs',
      status: 'skipped',
      message: 'Skipped SQLite/graph/chunk repairs because YAML is not fully parseable',
      details: yamlIssues.slice(0, 10),
    })
    return repairs
  }
  const schemaRepair = repairSchemaMigrations(store)
  repairs.push(schemaRepair)
  if (schemaRepair.status === 'failed') {
    repairs.push({
      name: 'load-dependent-repairs',
      status: 'skipped',
      message: 'Skipped SQLite/graph/chunk repairs because schema migration failed',
      details: schemaRepair.details?.slice(0, 10),
    })
    return repairs
  }

  const freshStore = new FlyupMemStore(store.config)
  repairs.push(repairSQLiteCache(freshStore))
  repairs.push(repairGraphIntegrity(freshStore))
  repairs.push(repairEngramChunks(freshStore))

  return repairs
}

function yamlParseIssues(basePath: string): string[] {
  const issues: string[] = []
  for (const filePath of yamlFilePaths(basePath)) {
    if (!fs.existsSync(filePath)) continue
    try {
      yaml.load(fs.readFileSync(filePath, 'utf-8'))
    } catch (err) {
      issues.push(`${path.relative(basePath, filePath)}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return issues
}

function yamlFilePaths(basePath: string): string[] {
  const files = [
    'engrams.yaml', 'observations.yaml', 'mental-models.yaml',
    'episodes.yaml', 'graph.yaml', 'feedback.yaml', 'config.yaml', 'schema.yaml',
  ].map(file => path.join(basePath, file))

  const chunkDir = path.join(basePath, 'engrams.d')
  if (fs.existsSync(chunkDir)) {
    for (const name of fs.readdirSync(chunkDir)) {
      if (name.endsWith('.yaml')) files.push(path.join(chunkDir, name))
    }
  }
  return files
}

function repairStaleLock(basePath: string, staleLockMs: number): DoctorRepair {
  const lockPath = path.join(basePath, '.lock')
  if (!fs.existsSync(lockPath)) {
    return { name: 'stale-lock', status: 'skipped', message: 'No lock file present' }
  }

  try {
    const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs
    if (ageMs < staleLockMs) {
      return {
        name: 'stale-lock',
        status: 'skipped',
        message: `Lock file is recent (${Math.round(ageMs / 1000)}s old); left untouched`,
      }
    }
    fs.unlinkSync(lockPath)
    return {
      name: 'stale-lock',
      status: 'repaired',
      message: `Removed stale lock file (${Math.round(ageMs / 1000)}s old)`,
    }
  } catch (err) {
    return { name: 'stale-lock', status: 'failed', message: 'Failed to inspect/remove lock file', details: [String(err)] }
  }
}

function repairSchemaMigrations(store: FlyupMemStore): DoctorRepair {
  const result = flyupMigrate(store, { dryRun: false })
  if (!result.ok) {
    return {
      name: 'schema-migrations',
      status: 'failed',
      message: 'Failed to apply store schema migrations',
      details: result.steps.flatMap(step => step.details ?? []),
    }
  }
  const changed = result.steps.filter(step => step.status === 'applied' && step.id !== 'backup' && step.id !== 'rollback')
  if (changed.length === 0) {
    return {
      name: 'schema-migrations',
      status: 'skipped',
      message: `Store schema already current at v${CURRENT_STORE_SCHEMA_VERSION}`,
    }
  }
  return {
    name: 'schema-migrations',
    status: 'repaired',
    message: `Applied ${changed.length} schema migration step(s)`,
    details: changed.map(step => `${step.id}: ${step.message}`),
  }
}

function repairSQLiteCache(store: FlyupMemStore): DoctorRepair {
  try {
    store.load()
    store.cache.close()
    for (const suffix of ['', '-wal', '-shm']) {
      const dbPath = path.join(store.basePath, `index.sqlite${suffix}`)
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
    }
    store.cache.open()
    const result = store.cache.rebuildFromData({
      engrams: store.engrams,
      observations: store.observations,
      mentalModels: store.mentalModels,
    })
    return {
      name: 'sqlite-cache',
      status: 'repaired',
      message: `Rebuilt SQLite cache from YAML (${result.indexed} memories indexed)`,
    }
  } catch (err) {
    return { name: 'sqlite-cache', status: 'failed', message: 'Failed to rebuild SQLite cache', details: [String(err)] }
  }
}

function repairGraphIntegrity(store: FlyupMemStore): DoctorRepair {
  try {
    store.load()
    const allIds = new Set(store.allMemories().map(m => m.id))
    const graph = store.graph
    const beforeEdges = graph.edges.length
    const beforeEntities = Object.keys(graph.entities).length

    graph.edges = graph.edges.filter(edge => allIds.has(edge.from) && allIds.has(edge.to))
    for (const [name, entity] of Object.entries(graph.entities)) {
      entity.memory_ids = entity.memory_ids.filter(id => allIds.has(id))
      if (entity.memory_ids.length === 0) delete graph.entities[name]
    }

    const removedEdges = beforeEdges - graph.edges.length
    const removedEntities = beforeEntities - Object.keys(graph.entities).length
    if (removedEdges === 0 && removedEntities === 0) {
      return { name: 'graph-integrity', status: 'skipped', message: 'No dangling graph references found' }
    }

    store.save()
    return {
      name: 'graph-integrity',
      status: 'repaired',
      message: `Removed ${removedEdges} dangling edge(s) and ${removedEntities} empty entity/entities`,
    }
  } catch (err) {
    return { name: 'graph-integrity', status: 'failed', message: 'Failed to repair graph references', details: [String(err)] }
  }
}

function repairEngramChunks(store: FlyupMemStore): DoctorRepair {
  try {
    store.load()
    store.save()
    const chunkDir = path.join(store.basePath, 'engrams.d')
    const chunkCount = fs.existsSync(chunkDir)
      ? fs.readdirSync(chunkDir).filter(name => name.endsWith('.yaml')).length
      : 0
    return {
      name: 'engram-chunks',
      status: 'repaired',
      message: `Rewrote engram hot tail/archive layout (${chunkCount} archive chunk(s))`,
    }
  } catch (err) {
    return { name: 'engram-chunks', status: 'failed', message: 'Failed to rewrite engram chunks', details: [String(err)] }
  }
}
