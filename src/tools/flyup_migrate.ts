// src/tools/flyup_migrate.ts — Store schema migrations

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import type { FlyupMemStore } from '../core/store.js'
import { acquireLockSync, FlyupMemStore as Store } from '../core/store.js'
import { DEFAULT_CONFIG } from '../core/types.js'

export const CURRENT_STORE_SCHEMA_VERSION = 1

export const MIGRATION_IDS = [
  '001-add-activation-turn-count',
  '002-add-engram-adoption-count',
  '003-ensure-config-defaults',
  '004-ensure-graph-default',
  '005-rewrite-engram-chunks',
] as const

type MigrationId = typeof MIGRATION_IDS[number]

export interface StoreSchemaMeta {
  schema_version: number
  last_migrated_at: string | null
  migrations_applied: string[]
}

export interface MigrateOptions {
  dryRun?: boolean
  lockTimeoutMs?: number
}

export interface MigrationStep {
  id: MigrationId | 'schema-metadata' | 'backup' | 'rollback'
  status: 'pending' | 'applied' | 'skipped' | 'failed'
  message: string
  details?: string[]
}

export interface MigrateResult {
  ok: boolean
  dryRun: boolean
  applied: boolean
  currentVersion: number
  targetVersion: number
  schemaPath: string
  backupPath?: string
  steps: MigrationStep[]
}

type YamlRecord = Record<string, unknown>

export function createStoreSchemaMeta(appliedAt = new Date().toISOString()): StoreSchemaMeta {
  return {
    schema_version: CURRENT_STORE_SCHEMA_VERSION,
    last_migrated_at: appliedAt,
    migrations_applied: [...MIGRATION_IDS],
  }
}

export function loadStoreSchemaMeta(basePath: string): StoreSchemaMeta {
  const loaded = loadStoreSchemaMetaStrict(basePath)
  return loaded.ok
    ? loaded.meta
    : { schema_version: 0, last_migrated_at: null, migrations_applied: [] }
}

export function loadStoreSchemaMetaStrict(basePath: string): { ok: true; meta: StoreSchemaMeta } | { ok: false; error: string; meta: StoreSchemaMeta } {
  const filePath = path.join(basePath, 'schema.yaml')
  const fallback = { schema_version: 0, last_migrated_at: null, migrations_applied: [] }
  if (!fs.existsSync(filePath)) {
    return { ok: true, meta: fallback }
  }
  try {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'))
    if (!isRecord(raw)) return { ok: false, error: 'schema.yaml must contain a YAML object', meta: fallback }
    if (typeof raw.schema_version !== 'number') {
      return { ok: false, error: 'schema.yaml schema_version must be a number', meta: fallback }
    }
    if (raw.last_migrated_at !== null && raw.last_migrated_at !== undefined && typeof raw.last_migrated_at !== 'string') {
      return { ok: false, error: 'schema.yaml last_migrated_at must be a string or null', meta: fallback }
    }
    if (!Array.isArray(raw.migrations_applied)) {
      return { ok: false, error: 'schema.yaml migrations_applied must be an array', meta: fallback }
    }
    const invalidIds = raw.migrations_applied.filter(id => typeof id !== 'string')
    if (invalidIds.length > 0) {
      return { ok: false, error: 'schema.yaml migrations_applied must contain only strings', meta: fallback }
    }
    return {
      ok: true,
      meta: {
        schema_version: raw.schema_version,
        last_migrated_at: typeof raw.last_migrated_at === 'string' ? raw.last_migrated_at : null,
        migrations_applied: raw.migrations_applied as string[],
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      meta: fallback,
    }
  }
}

export function missingMigrationIds(meta: StoreSchemaMeta): string[] {
  return MIGRATION_IDS.filter(id => !meta.migrations_applied.includes(id))
}

export function flyupMigrate(store: FlyupMemStore, options: MigrateOptions = {}): MigrateResult {
  const dryRun = options.dryRun ?? true
  const basePath = store.basePath
  const schemaPath = path.join(basePath, 'schema.yaml')
  const beforeMeta = loadStoreSchemaMeta(basePath)
  const steps: MigrationStep[] = []
  let backupPath: string | undefined
  let releaseLock: (() => void) | undefined

  try {
    fs.mkdirSync(basePath, { recursive: true })

    if (beforeMeta.schema_version > CURRENT_STORE_SCHEMA_VERSION) {
      steps.push({
        id: 'schema-metadata',
        status: 'failed',
        message: `Store schema v${beforeMeta.schema_version} is newer than this CLI supports (v${CURRENT_STORE_SCHEMA_VERSION}); refusing to migrate`,
        details: ['Upgrade FlyupMem before running migrations or repairs'],
      })
    } else {
      if (!dryRun) {
        releaseLock = acquireLockSync(path.join(basePath, '.lock'), options.lockTimeoutMs)
        backupPath = createMigrationBackup(basePath)
        steps.push({
          id: 'backup',
          status: 'applied',
          message: `Created migration backup: ${backupPath}`,
        })
      }

      steps.push(migrateActivationTurnCount(basePath, dryRun))
      steps.push(migrateEngramAdoptionCount(basePath, dryRun))
      steps.push(migrateConfigDefaults(basePath, dryRun))
      steps.push(migrateGraphDefault(basePath, dryRun))
      steps.push(rewriteEngramChunks(store, dryRun))
      steps.push(updateSchemaMetadata(basePath, beforeMeta, dryRun))
    }
  } catch (err) {
    steps.push({
      id: 'schema-metadata',
      status: 'failed',
      message: err instanceof Error ? err.message : 'Migration failed',
      details: [err instanceof Error ? err.message : String(err)],
    })
    if (!dryRun && backupPath) {
      try {
        restoreMigrationBackup(basePath, backupPath)
        steps.push({
          id: 'rollback',
          status: 'applied',
          message: `Rolled back store from backup: ${backupPath}`,
        })
      } catch (rollbackErr) {
        steps.push({
          id: 'rollback',
          status: 'failed',
          message: 'Rollback failed; inspect backup before retrying',
          details: [rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr), `backup: ${backupPath}`],
        })
      }
    }
  } finally {
    if (releaseLock) releaseLock()
  }

  const hasFailed = steps.some(step => step.status === 'failed')
  const applied = steps.some(step => step.status === 'applied' && step.id !== 'backup' && step.id !== 'rollback')
  return {
    ok: !hasFailed,
    dryRun,
    applied,
    currentVersion: beforeMeta.schema_version,
    targetVersion: CURRENT_STORE_SCHEMA_VERSION,
    schemaPath,
    backupPath,
    steps,
  }
}

function migrateActivationTurnCount(basePath: string, dryRun: boolean): MigrationStep {
  const files = memoryYamlFiles(basePath)
  const details: string[] = []
  let changed = 0

  for (const filePath of files) {
    const items = loadYamlArray(filePath)
    let fileChanged = 0
    for (const item of items) {
      if (!isRecord(item)) continue
      const activation = item.activation
      if (!isRecord(activation)) continue
      if (typeof activation.turn_count !== 'number') {
        activation.turn_count = 0
        fileChanged++
      }
    }
    if (fileChanged > 0) {
      changed += fileChanged
      details.push(`${path.relative(basePath, filePath)}: ${fileChanged} memory/memories`)
      if (!dryRun) writeYaml(filePath, items)
    }
  }

  return stepResult(
    '001-add-activation-turn-count',
    dryRun,
    changed,
    changed === 0 ? 'All memory activation records already include turn_count' : `Add activation.turn_count to ${changed} memory/memories`,
    details,
  )
}

function migrateEngramAdoptionCount(basePath: string, dryRun: boolean): MigrationStep {
  const files = engramYamlFiles(basePath)
  const details: string[] = []
  let changed = 0

  for (const filePath of files) {
    const items = loadYamlArray(filePath)
    let fileChanged = 0
    for (const item of items) {
      if (!isRecord(item)) continue
      if (typeof item.adoption_count !== 'number') {
        item.adoption_count = 0
        fileChanged++
      }
    }
    if (fileChanged > 0) {
      changed += fileChanged
      details.push(`${path.relative(basePath, filePath)}: ${fileChanged} engram(s)`)
      if (!dryRun) writeYaml(filePath, items)
    }
  }

  return stepResult(
    '002-add-engram-adoption-count',
    dryRun,
    changed,
    changed === 0 ? 'All engrams already include adoption_count' : `Add adoption_count to ${changed} engram(s)`,
    details,
  )
}

function migrateConfigDefaults(basePath: string, dryRun: boolean): MigrationStep {
  const filePath = path.join(basePath, 'config.yaml')
  const exists = fs.existsSync(filePath)
  const config = loadYamlRecord(filePath, {})
  if (Object.prototype.hasOwnProperty.call(config, 'recall_activation_persistence')) {
    return {
      id: '003-ensure-config-defaults',
      status: 'skipped',
      message: 'config.yaml already defines recall_activation_persistence; preserving user value',
    }
  }

  config.recall_activation_persistence = DEFAULT_CONFIG.recall_activation_persistence
  if (!dryRun) writeYaml(filePath, config)
  return {
    id: '003-ensure-config-defaults',
    status: dryRun ? 'pending' : 'applied',
    message: exists
      ? `Add missing config recall_activation_persistence=${DEFAULT_CONFIG.recall_activation_persistence}`
      : `Create config.yaml with recall_activation_persistence=${DEFAULT_CONFIG.recall_activation_persistence}`,
  }
}

function migrateGraphDefault(basePath: string, dryRun: boolean): MigrationStep {
  const filePath = path.join(basePath, 'graph.yaml')
  if (fs.existsSync(filePath)) {
    const graph = loadYamlRecord(filePath, {})
    const hasEntities = isRecord(graph.entities)
    const hasEdges = Array.isArray(graph.edges)
    if (hasEntities && hasEdges) {
      return {
        id: '004-ensure-graph-default',
        status: 'skipped',
        message: 'graph.yaml already has entities and edges',
      }
    }
    if (!hasEntities) graph.entities = {}
    if (!hasEdges) graph.edges = []
    if (!dryRun) writeYaml(filePath, graph)
    return {
      id: '004-ensure-graph-default',
      status: dryRun ? 'pending' : 'applied',
      message: 'Normalize graph.yaml default shape',
    }
  }

  if (!dryRun) writeYaml(filePath, { entities: {}, edges: [] })
  return {
    id: '004-ensure-graph-default',
    status: dryRun ? 'pending' : 'applied',
    message: 'Create graph.yaml default shape',
  }
}

function rewriteEngramChunks(store: FlyupMemStore, dryRun: boolean): MigrationStep {
  const basePath = store.basePath
  const engrams = countYamlArray(path.join(basePath, 'engrams.yaml'))
  const chunks = engramChunkFiles(basePath).length
  const maxPerFile = Math.max(1, store.config.max_engrams_per_file)
  const shouldRewrite = engrams > maxPerFile || chunks > 0

  if (!shouldRewrite) {
    return {
      id: '005-rewrite-engram-chunks',
      status: 'skipped',
      message: 'Engram files already fit current chunk layout',
    }
  }

  if (!dryRun) {
    const rewriteStore = new Store(store.config)
    rewriteStore.load()
    rewriteStore.save()
  }

  return {
    id: '005-rewrite-engram-chunks',
    status: dryRun ? 'pending' : 'applied',
    message: `Rewrite engram hot/archive layout with max_engrams_per_file=${maxPerFile}`,
  }
}

function updateSchemaMetadata(basePath: string, beforeMeta: StoreSchemaMeta, dryRun: boolean): MigrationStep {
  const missingIds = missingMigrationIds(beforeMeta)
  const needsUpdate = beforeMeta.schema_version < CURRENT_STORE_SCHEMA_VERSION || missingIds.length > 0
  if (!needsUpdate) {
    return {
      id: 'schema-metadata',
      status: 'skipped',
      message: `Store schema metadata is current at v${CURRENT_STORE_SCHEMA_VERSION}`,
    }
  }

  if (!dryRun) writeYaml(path.join(basePath, 'schema.yaml'), createStoreSchemaMeta())
  return {
    id: 'schema-metadata',
    status: dryRun ? 'pending' : 'applied',
    message: `Mark store schema as v${CURRENT_STORE_SCHEMA_VERSION}`,
    details: missingIds.length ? [`missing migrations: ${missingIds.join(', ')}`] : undefined,
  }
}

function stepResult(
  id: MigrationId,
  dryRun: boolean,
  changed: number,
  message: string,
  details: string[],
): MigrationStep {
  return {
    id,
    status: changed === 0 ? 'skipped' : dryRun ? 'pending' : 'applied',
    message,
    details: details.length ? details : undefined,
  }
}

function createMigrationBackup(basePath: string): string {
  let backupPath = path.join(basePath, '.backups', `migrate-${timestampForPath()}`)
  let suffix = 0
  while (fs.existsSync(backupPath)) {
    suffix++
    backupPath = path.join(basePath, '.backups', `migrate-${timestampForPath()}-${suffix.toString().padStart(3, '0')}`)
  }
  fs.mkdirSync(path.dirname(backupPath), { recursive: true })
  fs.mkdirSync(backupPath, { recursive: false })
  for (const filePath of migratableYamlFiles(basePath)) {
    if (!fs.existsSync(filePath)) continue
    const relative = path.relative(basePath, filePath)
    const target = path.join(backupPath, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(filePath, target)
  }
  return backupPath
}

function restoreMigrationBackup(basePath: string, backupPath: string): void {
  for (const filePath of migratableYamlFiles(basePath)) {
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true })
  }
  if (!fs.existsSync(backupPath)) return
  for (const backupFile of listYamlFilesRecursive(backupPath)) {
    const relative = path.relative(backupPath, backupFile)
    const target = path.join(basePath, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(backupFile, target)
  }
}

function migratableYamlFiles(basePath: string): string[] {
  return [
    ...memoryYamlFiles(basePath),
    path.join(basePath, 'episodes.yaml'),
    path.join(basePath, 'graph.yaml'),
    path.join(basePath, 'feedback.yaml'),
    path.join(basePath, 'config.yaml'),
    path.join(basePath, 'schema.yaml'),
  ]
}

function memoryYamlFiles(basePath: string): string[] {
  return [
    ...engramYamlFiles(basePath),
    path.join(basePath, 'observations.yaml'),
    path.join(basePath, 'mental-models.yaml'),
  ].filter(filePath => fs.existsSync(filePath))
}

function engramYamlFiles(basePath: string): string[] {
  const files = [...engramChunkFiles(basePath), path.join(basePath, 'engrams.yaml')]
  return files.filter(filePath => fs.existsSync(filePath))
}

function engramChunkFiles(basePath: string): string[] {
  const chunkDir = path.join(basePath, 'engrams.d')
  if (!fs.existsSync(chunkDir)) return []
  return fs.readdirSync(chunkDir)
    .filter(name => name.endsWith('.yaml'))
    .sort()
    .map(name => path.join(chunkDir, name))
}

function listYamlFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listYamlFilesRecursive(fullPath))
    else if (entry.isFile() && entry.name.endsWith('.yaml')) files.push(fullPath)
  }
  return files.sort()
}

function countYamlArray(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0
  const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  return Array.isArray(raw) ? raw.length : 0
}

function loadYamlArray(filePath: string): unknown[] {
  const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  if (!Array.isArray(raw)) throw new Error(`${filePath} must contain a YAML array`)
  return raw
}

function loadYamlRecord(filePath: string, fallback: YamlRecord): YamlRecord {
  if (!fs.existsSync(filePath)) return { ...fallback }
  const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  if (raw === null || raw === undefined) return { ...fallback }
  if (!isRecord(raw)) throw new Error(`${filePath} must contain a YAML object`)
  return raw
}

function writeYaml(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp.${process.pid}`
  fs.writeFileSync(tmp, yaml.dump(data, { lineWidth: 120, noRefs: true }), 'utf-8')
  fs.renameSync(tmp, filePath)
}

function timestampForPath(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\./g, '')
  const random = Math.random().toString(36).slice(2, 8)
  return `${stamp}-${process.pid}-${random}`
}

function isRecord(value: unknown): value is YamlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
