// tests/maintain.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { execFileSync } from 'node:child_process'
import { FlyupMemStore } from '../src/core/store.js'
import { flyupMaintain, loadMaintenanceState } from '../src/tools/flyup_maintain.js'
import type { Engram } from '../src/core/types.js'
import { generateId } from '../src/core/id.js'
import { contentHash } from '../src/core/hash.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-maintain-'))
}

function runMaintainCli(defaultDir: string, args: string[]): string {
  const tsx = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsx')
  return execFileSync(tsx, ['src/index.ts', 'maintain', ...args], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, FLYUPMEM_STORE_PATH: defaultDir },
    encoding: 'utf-8',
  })
}

function makeEngram(overrides: Partial<Engram> = {}): Engram {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const statement = overrides.statement ?? 'Maintain graph for FlyupMem local reliability'
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
    domain: 'test',
    tags: ['maintenance'],
    statement,
    rationale: '',
    contraindications: [],
    entities: [{ name: 'FlyupMem', type: 'project' }],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { episode_id: null, quote: statement, origin: 'test' },
    activation: { retrieval_strength: 0.9, storage_strength: 1.0, frequency: 1, turn_count: 1, last_accessed: today },
    emotional_weight: 5,
    confidence: 7,
    content_hash: contentHash(statement),
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 1,
    adoption_count: 0,
    ...overrides,
  }
}

describe('flyupMaintain tiered scheduler', () => {
  let dir: string
  let store: FlyupMemStore

  beforeEach(() => {
    dir = tmpDir()
    store = new FlyupMemStore({ store_path: dir })
    store.load()
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('runs light mode as graph-only maintenance and records state', async () => {
    store.addEngram(makeEngram())

    const result = await flyupMaintain(store, { mode: 'light' })

    expect(result.mode).toBe('light')
    expect(result.decay.processed).toBe(0)
    expect(result.consolidation.merged).toBe(0)
    expect(result.consolidation.updated).toBe(0)
    expect(result.graph.processed).toBeGreaterThanOrEqual(0)
    expect(result.state.last_light_at).toBeTruthy()
    expect(fs.existsSync(path.join(dir, '.maintenance.yaml'))).toBe(true)

    const persisted = yaml.load(fs.readFileSync(path.join(dir, '.maintenance.yaml'), 'utf8')) as Record<string, unknown>
    expect(persisted.last_light_at).toBe(result.state.last_light_at)
  })

  it('runs rem mode with decay and records last_rem_at', async () => {
    const oldDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
    store.addEngram(makeEngram({
      activation: { retrieval_strength: 0.9, storage_strength: 1.0, frequency: 1, turn_count: 1, last_accessed: oldDate },
    }))

    const result = await flyupMaintain(store, { mode: 'rem' })

    expect(result.mode).toBe('rem')
    expect(result.decay.processed).toBe(1)
    expect(result.state.last_rem_at).toBeTruthy()
    expect(loadMaintenanceState(store).last_rem_at).toBe(result.state.last_rem_at)
  })

  it('CLI --store runs maintenance against the requested store path', () => {
    const defaultDir = tmpDir()
    const cliDir = tmpDir()

    try {
      const stdout = runMaintainCli(defaultDir, ['--mode', 'light', '--store', cliDir])
      const parsed = JSON.parse(stdout.slice(stdout.indexOf('{')))

      expect(parsed.mode).toBe('light')
      expect(fs.existsSync(path.join(cliDir, '.maintenance.yaml'))).toBe(true)
      expect(fs.existsSync(path.join(defaultDir, '.maintenance.yaml'))).toBe(false)
    } finally {
      fs.rmSync(defaultDir, { recursive: true, force: true })
      fs.rmSync(cliDir, { recursive: true, force: true })
    }
  }, 30000)
})
