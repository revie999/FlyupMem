// tests/migrate.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { execFileSync } from 'node:child_process'
import { FlyupMemStore } from '../src/core/store.js'
import { contentHash } from '../src/core/hash.js'
import { generateId } from '../src/core/id.js'
import type { Engram } from '../src/core/types.js'
import { CURRENT_STORE_SCHEMA_VERSION, flyupMigrate } from '../src/tools/flyup_migrate.js'
import { flyupDoctor } from '../src/tools/flyup_doctor.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-migrate-'))
}

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  return {
    id: generateId('raw'),
    version: 1,
    layer: 'raw',
    status: 'active',
    consolidated: false,
    type: 'procedural',
    memory_class: 'semantic',
    polarity: 'do',
    commitment: 'decided',
    scope: 'global',
    visibility: 'private',
    domain: 'testing',
    tags: ['test'],
    statement: 'Migration marker',
    rationale: '',
    contraindications: [],
    entities: [],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { episode_id: null, quote: 'test', origin: 'test' },
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 1, turn_count: 0, last_accessed: today },
    emotional_weight: 5,
    confidence: 7,
    content_hash: contentHash('Migration marker'),
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    adoption_count: 0,
    previous_version_ref: null,
    derivation_count: 1,
    ...overrides,
  }
}

function oldEngram(id: string): Record<string, unknown> {
  const engram = makeEngram({ id, statement: `old migration marker ${id}`, content_hash: contentHash(`old migration marker ${id}`) })
  const raw = engram as unknown as Record<string, unknown>
  delete raw.adoption_count
  delete (raw.activation as Record<string, unknown>).turn_count
  return raw
}

function runCli(dir: string, args: string[]): string {
  const tsx = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsx')
  return execFileSync(tsx, ['src/index.ts', 'migrate', ...args], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, FLYUPMEM_STORE_PATH: dir },
    encoding: 'utf-8',
  })
}

describe('flyupMigrate', () => {
  let tmp: string

  beforeEach(() => {
    tmp = tmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('dry-run reports pending migrations without writing files', () => {
    fs.mkdirSync(tmp, { recursive: true })
    const old = [oldEngram('MIGRATE-DRY-001')]
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), yaml.dump(old, { lineWidth: 120, noRefs: true }), 'utf8')
    const before = fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf8')

    const result = flyupMigrate(new FlyupMemStore({ store_path: tmp }), { dryRun: true })

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(false)
    expect(result.steps.some(step => step.status === 'pending')).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'schema.yaml'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, 'config.yaml'))).toBe(false)
    expect(fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf8')).toBe(before)
  })

  it('applies old field defaults, schema metadata, config, and graph defaults', () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), yaml.dump([oldEngram('MIGRATE-APPLY-001')], { lineWidth: 120, noRefs: true }), 'utf8')

    const result = flyupMigrate(new FlyupMemStore({ store_path: tmp }), { dryRun: false })

    expect(result.ok).toBe(true)
    expect(result.applied).toBe(true)
    const engrams = yaml.load(fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf8')) as Array<Record<string, unknown>>
    expect((engrams[0].activation as Record<string, unknown>).turn_count).toBe(0)
    expect(engrams[0].adoption_count).toBe(0)

    const config = yaml.load(fs.readFileSync(path.join(tmp, 'config.yaml'), 'utf8')) as Record<string, unknown>
    expect(config.recall_activation_persistence).toBe('sqlite')
    const graph = yaml.load(fs.readFileSync(path.join(tmp, 'graph.yaml'), 'utf8')) as Record<string, unknown>
    expect(graph.entities).toEqual({})
    expect(graph.edges).toEqual([])
    const schema = yaml.load(fs.readFileSync(path.join(tmp, 'schema.yaml'), 'utf8')) as Record<string, unknown>
    expect(schema.schema_version).toBe(CURRENT_STORE_SCHEMA_VERSION)
  })

  it('preserves an explicit user recall_activation_persistence config value', () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'config.yaml'), 'recall_activation_persistence: yaml\n', 'utf8')

    const result = flyupMigrate(new FlyupMemStore({ store_path: tmp }), { dryRun: false })

    expect(result.ok).toBe(true)
    const config = yaml.load(fs.readFileSync(path.join(tmp, 'config.yaml'), 'utf8')) as Record<string, unknown>
    expect(config.recall_activation_persistence).toBe('yaml')
  })

  it('creates a backup before apply and rolls back partial YAML writes on failure', () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), yaml.dump([oldEngram('MIGRATE-ROLLBACK-001')], { lineWidth: 120, noRefs: true }), 'utf8')
    fs.writeFileSync(path.join(tmp, 'config.yaml'), yaml.dump(['invalid-config-shape']), 'utf8')
    const before = fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf8')

    const result = flyupMigrate(new FlyupMemStore({ store_path: tmp }), { dryRun: false })

    expect(result.ok).toBe(false)
    expect(result.backupPath).toBeDefined()
    expect(fs.existsSync(result.backupPath!)).toBe(true)
    expect(result.steps.find(step => step.id === 'rollback')!.status).toBe('applied')
    expect(fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf8')).toBe(before)
    expect(fs.existsSync(path.join(tmp, 'schema.yaml'))).toBe(false)
  })

  it('doctor warns when schema metadata is incomplete or newer than the CLI', async () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'schema.yaml'), yaml.dump({
      schema_version: CURRENT_STORE_SCHEMA_VERSION,
      last_migrated_at: new Date().toISOString(),
      migrations_applied: ['001-add-activation-turn-count'],
    }), 'utf8')

    const incomplete = await flyupDoctor(new FlyupMemStore({ store_path: tmp }))
    expect(incomplete.checks.find(check => check.name === 'schema-version')!.status).toBe('warn')

    fs.writeFileSync(path.join(tmp, 'schema.yaml'), yaml.dump({
      schema_version: 999,
      last_migrated_at: new Date().toISOString(),
      migrations_applied: [],
    }), 'utf8')
    const future = await flyupDoctor(new FlyupMemStore({ store_path: tmp }))
    const check = future.checks.find(c => c.name === 'schema-version')!
    expect(check.status).toBe('warn')
    expect(check.message).toContain('newer')
  })

  it('doctor fails invalid schema.yaml instead of treating it as v0', async () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'schema.yaml'), yaml.dump(['not-a-schema-object']), 'utf8')

    const result = await flyupDoctor(new FlyupMemStore({ store_path: tmp }))

    const check = result.checks.find(c => c.name === 'schema-version')!
    expect(check.status).toBe('fail')
    expect(result.overall).toBe('error')
  })

  it('does not migrate or doctor-repair stores from a future schema version', async () => {
    fs.mkdirSync(tmp, { recursive: true })
    const futureSchema = {
      schema_version: 999,
      last_migrated_at: new Date().toISOString(),
      migrations_applied: [],
    }
    fs.writeFileSync(path.join(tmp, 'schema.yaml'), yaml.dump(futureSchema), 'utf8')
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), yaml.dump(
      Array.from({ length: 5 }, (_, i) => oldEngram(`MIGRATE-FUTURE-${i + 1}`)),
      { lineWidth: 120, noRefs: true },
    ), 'utf8')
    const before = fs.readFileSync(path.join(tmp, 'schema.yaml'), 'utf8')
    const engramsBefore = fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf8')

    const migrate = flyupMigrate(new FlyupMemStore({ store_path: tmp }), { dryRun: false })
    expect(migrate.ok).toBe(false)
    expect(migrate.applied).toBe(false)
    expect(migrate.backupPath).toBeUndefined()
    expect(fs.readFileSync(path.join(tmp, 'schema.yaml'), 'utf8')).toBe(before)

    const repaired = await flyupDoctor(new FlyupMemStore({ store_path: tmp, max_engrams_per_file: 2 }), { repair: true })
    const repair = repaired.repairs!.find(r => r.name === 'schema-migrations')!
    expect(repair.status).toBe('failed')
    expect(repaired.repairs!.find(r => r.name === 'load-dependent-repairs')!.status).toBe('skipped')
    expect(fs.readFileSync(path.join(tmp, 'schema.yaml'), 'utf8')).toBe(before)
    expect(fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf8')).toBe(engramsBefore)
    expect(fs.existsSync(path.join(tmp, 'engrams.d'))).toBe(false)
  })

  it('creates unique backup paths for rapid consecutive apply runs', () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), yaml.dump([oldEngram('MIGRATE-BACKUP-001')], { lineWidth: 120, noRefs: true }), 'utf8')

    const first = flyupMigrate(new FlyupMemStore({ store_path: tmp }), { dryRun: false })
    const second = flyupMigrate(new FlyupMemStore({ store_path: tmp }), { dryRun: false })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(first.backupPath).toBeDefined()
    expect(second.backupPath).toBeDefined()
    expect(first.backupPath).not.toBe(second.backupPath)
    expect(fs.existsSync(first.backupPath!)).toBe(true)
    expect(fs.existsSync(second.backupPath!)).toBe(true)
  })

  it('respects the store lock while applying migrations', () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, '.lock'), JSON.stringify({ pid: 999999, created_at: new Date().toISOString() }), 'utf8')

    const result = flyupMigrate(new FlyupMemStore({ store_path: tmp }), { dryRun: false, lockTimeoutMs: 100 })

    expect(result.ok).toBe(false)
    expect(result.applied).toBe(false)
    expect(result.steps.some(step => step.message.includes('Timed out waiting for FlyupMem store lock'))).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'schema.yaml'))).toBe(false)
    fs.rmSync(path.join(tmp, '.lock'), { force: true })
  })

  it('does not treat a same-pid lock file as reentrant unless this process acquired it', () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, '.lock'), JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }), 'utf8')

    const result = flyupMigrate(new FlyupMemStore({ store_path: tmp }), { dryRun: false, lockTimeoutMs: 100 })

    expect(result.ok).toBe(false)
    expect(result.applied).toBe(false)
    expect(result.steps.some(step => step.message.includes('Timed out waiting for FlyupMem store lock'))).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'schema.yaml'))).toBe(false)
    fs.rmSync(path.join(tmp, '.lock'), { force: true })
  })

  it('rewrites old single-file engrams into archive chunks', () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), yaml.dump(
      Array.from({ length: 5 }, (_, i) => oldEngram(`MIGRATE-CHUNK-${i + 1}`)),
      { lineWidth: 120, noRefs: true },
    ), 'utf8')

    const result = flyupMigrate(new FlyupMemStore({ store_path: tmp, max_engrams_per_file: 2 }), { dryRun: false })

    expect(result.ok).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'engrams.d', 'engrams-000001.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'engrams.d', 'engrams-000002.yaml'))).toBe(true)
    const hot = fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf8')
    expect(hot).toContain('MIGRATE-CHUNK-5')
    expect(hot).not.toContain('MIGRATE-CHUNK-1')
  })

  it('CLI defaults to dry-run and --apply writes metadata', () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), yaml.dump([oldEngram('MIGRATE-CLI-001')], { lineWidth: 120, noRefs: true }), 'utf8')

    const dryRun = runCli(tmp, [])
    expect(dryRun).toContain('dry-run')
    expect(fs.existsSync(path.join(tmp, 'schema.yaml'))).toBe(false)

    const apply = runCli(tmp, ['--apply'])
    expect(apply).toContain('apply')
    expect(fs.existsSync(path.join(tmp, 'schema.yaml'))).toBe(true)
  }, 30000)

  it('doctor reports behind schema and doctor --repair applies migrations', async () => {
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), yaml.dump([oldEngram('MIGRATE-DOCTOR-001')], { lineWidth: 120, noRefs: true }), 'utf8')

    const before = await flyupDoctor(new FlyupMemStore({ store_path: tmp }))
    expect(before.checks.find(check => check.name === 'schema-version')!.status).toBe('warn')

    const repaired = await flyupDoctor(new FlyupMemStore({ store_path: tmp }), { repair: true })
    expect(repaired.repairs!.find(repair => repair.name === 'schema-migrations')!.status).toBe('repaired')
    expect(repaired.checks.find(check => check.name === 'schema-version')!.status).toBe('pass')
  })
})
