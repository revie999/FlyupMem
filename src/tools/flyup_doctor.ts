// src/tools/flyup_doctor.ts — Deep health check for FlyupMem store

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import type { FlyupMemStore } from '../core/store.js'
import type { Memory } from '../core/types.js'
import { isEmbeddingAvailable } from '../search/embed.js'

export interface DoctorResult {
  overall: 'healthy' | 'warning' | 'error'
  checks: DoctorCheck[]
}

export interface DoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  details?: string[]
}

/**
 * Deep health check: validates store integrity, YAML parsability,
 * ID uniqueness, graph consistency, and embedding availability.
 */
export async function flyupDoctor(store: FlyupMemStore): Promise<DoctorResult> {
  const checks: DoctorCheck[] = []
  const basePath = store.basePath

  // ─── 1. Store path exists & writable ──────────────────────
  checks.push(checkStorePath(basePath))

  // ─── 2. YAML files parseable ──────────────────────────────
  checks.push(checkYamlFiles(basePath))

  // ─── 3. Zod schema validation (via store.load) ───────────
  checks.push(checkSchemaValidation(store))

  // ─── 4. Duplicate ID check ───────────────────────────────
  checks.push(checkDuplicateIds(store))

  // ─── 5. Graph integrity ──────────────────────────────────
  checks.push(checkGraphIntegrity(store))

  // ─── 6. Temporal consistency ─────────────────────────────
  checks.push(checkTemporalConsistency(store))

  // ─── 7. Activation range ─────────────────────────────────
  checks.push(checkActivationRange(store))

  // ─── 8. Embedding availability ───────────────────────────
  checks.push(await checkEmbedding())

  // ─── 9. File size warnings ───────────────────────────────
  checks.push(checkFileSizes(basePath))

  // ─── 10. Hermes plugin link ──────────────────────────────
  checks.push(checkHermesPlugin())

  // ─── Compute overall ─────────────────────────────────────
  const hasFail = checks.some(c => c.status === 'fail')
  const hasWarn = checks.some(c => c.status === 'warn')
  const overall = hasFail ? 'error' : hasWarn ? 'warning' : 'healthy'

  return { overall, checks }
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
  const yamlFiles = [
    'engrams.yaml', 'observations.yaml', 'mental-models.yaml',
    'episodes.yaml', 'graph.yaml', 'feedback.yaml',
  ]
  const issues: string[] = []
  const parsed: string[] = []

  for (const file of yamlFiles) {
    const fp = path.join(basePath, file)
    if (!fs.existsSync(fp)) continue
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
  const available = await isEmbeddingAvailable()
  if (available) {
    return { name: 'embedding', status: 'pass', message: 'BGE-small-zh embedding model available' }
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
