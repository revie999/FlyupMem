// src/tools/flyup_setup.ts — Environment check + store initialization

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as yaml from 'js-yaml'
import type { FlyupMemStore } from '../core/store.js'
import { createStoreSchemaMeta } from './flyup_migrate.js'

export interface SetupResult {
  ok: boolean
  steps: SetupStep[]
}

export interface SetupStep {
  name: string
  status: 'ok' | 'skip' | 'fail'
  message: string
}

/**
 * Check environment and initialize store directory if needed.
 * Non-destructive: never overwrites existing data.
 */
export function flyupSetup(store: FlyupMemStore, force = false): SetupResult {
  const steps: SetupStep[] = []
  const basePath = store.basePath

  // ─── 1. Node.js version ──────────────────────────────────
  steps.push(checkNodeVersion())

  // ─── 2. Store directory ──────────────────────────────────
  steps.push(ensureStoreDir(basePath))

  // ─── 3. Initialize YAML files ────────────────────────────
  steps.push(...initYamlFiles(basePath, force))

  // ─── 4. Embedding model check ────────────────────────────
  steps.push(checkOnnxRuntime())

  // ─── 5. Hermes plugin check ──────────────────────────────
  steps.push(checkHermesPlugin())

  // ─── 6. Store path env ───────────────────────────────────
  steps.push(checkStorePathEnv())

  const ok = steps.every(s => s.status !== 'fail')
  return { ok, steps }
}

// ─── Individual steps ─────────────────────────────────────────

function checkNodeVersion(): SetupStep {
  const ver = process.version
  const major = parseInt(ver.slice(1), 10)
  if (major >= 20) {
    return { name: 'node-version', status: 'ok', message: `Node.js ${ver} (>=20 required)` }
  }
  return { name: 'node-version', status: 'fail', message: `Node.js ${ver} — v20+ required` }
}

function ensureStoreDir(basePath: string): SetupStep {
  try {
    fs.mkdirSync(basePath, { recursive: true })
    if (fs.existsSync(basePath)) {
      return { name: 'store-dir', status: 'ok', message: `Store directory ready: ${basePath}` }
    }
    return { name: 'store-dir', status: 'fail', message: `Failed to create: ${basePath}` }
  } catch (err) {
    return { name: 'store-dir', status: 'fail', message: `Cannot create store dir: ${err}` }
  }
}

function initYamlFiles(basePath: string, force: boolean): SetupStep[] {
  const files: Array<[string, string]> = [
    ['engrams.yaml', '[]'],
    ['observations.yaml', '[]'],
    ['mental-models.yaml', '[]'],
    ['episodes.yaml', '[]'],
    ['graph.yaml', '{ entities: {}, edges: [] }'],
    ['feedback.yaml', '[]'],
    ['schema.yaml', yaml.dump(createStoreSchemaMeta(), { lineWidth: 120, noRefs: true })],
  ]

  const steps: SetupStep[] = []
  let created = 0
  let existed = 0

  for (const [file, defaultContent] of files) {
    const fp = path.join(basePath, file)
    if (fs.existsSync(fp) && !force) {
      existed++
      continue
    }
    try {
      // Use js-yaml for proper formatting
      const content = file === 'graph.yaml'
        ? 'entities: {}\nedges: []\n'
        : file === 'schema.yaml'
          ? defaultContent
          : '[]\n'
      fs.writeFileSync(fp, content, 'utf-8')
      created++
    } catch (err) {
      steps.push({ name: `init-${file}`, status: 'fail', message: `Cannot create ${file}: ${err}` })
    }
  }

  const msgs: string[] = []
  if (created > 0) msgs.push(`${created} file(s) created`)
  if (existed > 0) msgs.push(`${existed} file(s) already existed`)

  steps.push({
    name: 'yaml-files',
    status: 'ok',
    message: msgs.join(', ') || 'No YAML files needed',
  })

  return steps
}

function checkOnnxRuntime(): SetupStep {
  try {
    // Check if @xenova/transformers is importable
    const pkgPath = require.resolve('@xenova/transformers/package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    return {
      name: 'onnx-runtime',
      status: 'ok',
      message: `@xenova/transformers v${pkg.version} available`,
    }
  } catch {
    return {
      name: 'onnx-runtime',
      status: 'skip',
      message: '@xenova/transformers not installed (semantic search unavailable)',
    }
  }
}

function checkHermesPlugin(): SetupStep {
  const pluginLink = path.join(
    process.env.HOME ?? os.homedir(),
    '.hermes', 'plugins', 'flyupmem',
  )
  if (fs.existsSync(pluginLink)) {
    try {
      const target = fs.readlinkSync(pluginLink)
      return { name: 'hermes-plugin', status: 'ok', message: `Hermes plugin linked: ${target}` }
    } catch {
      return { name: 'hermes-plugin', status: 'ok', message: 'Hermes plugin directory exists' }
    }
  }
  return {
    name: 'hermes-plugin',
    status: 'skip',
    message: 'Hermes plugin not linked — run: ln -s <flyupmem>/hermes-plugin ~/.hermes/plugins/flyupmem',
  }
}

function checkStorePathEnv(): SetupStep {
  const envPath = process.env.FLYUPMEM_STORE_PATH
  if (envPath) {
    return { name: 'store-path-env', status: 'ok', message: `FLYUPMEM_STORE_PATH=${envPath}` }
  }
  return { name: 'store-path-env', status: 'ok', message: 'Using default store path (~/.flyupmem)' }
}
