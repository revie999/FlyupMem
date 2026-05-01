// src/tools/flyup_config.ts — Configuration management

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import type { FlyupMemStore } from '../core/store.js'
import type { FlyupMemConfig } from '../core/types.js'
import { DEFAULT_CONFIG } from '../core/types.js'

export interface ConfigResult {
  action: 'show' | 'set' | 'reset'
  config: FlyupMemConfig
  changed?: boolean
  message?: string
}

// Config keys that can be set
const CONFIG_KEYS: Record<string, { type: 'string' | 'number' | 'boolean'; description: string; values?: string[] }> = {
  'store_path': { type: 'string', description: 'Store directory path' },
  'max_engrams_per_file': { type: 'number', description: 'Max engrams per YAML file before sharding' },
  'max_file_size_mb': { type: 'number', description: 'Max YAML file size in MB before sharding' },
  'decay_enabled': { type: 'boolean', description: 'Enable ACT-R activation decay' },
  'consolidation_enabled': { type: 'boolean', description: 'Enable auto-consolidation (engram → observation)' },
  'embedding_enabled': { type: 'boolean', description: 'Enable BGE-small-zh embedding for semantic search' },
  'log_level': { type: 'string', description: 'Log level', values: ['debug', 'info', 'warn', 'error'] },
}

/**
 * Show current effective config (defaults merged with stored config).
 */
export function configShow(store: FlyupMemStore): ConfigResult {
  const storedConfig = loadStoredConfig(store.basePath)
  const merged = { ...DEFAULT_CONFIG, ...storedConfig }
  return {
    action: 'show',
    config: merged,
  }
}

/**
 * Set a config value. Validates key and value type.
 */
export function configSet(store: FlyupMemStore, key: string, value: string): ConfigResult {
  const keyDef = CONFIG_KEYS[key]
  if (!keyDef) {
    return {
      action: 'set',
      config: loadMergedConfig(store.basePath),
      changed: false,
      message: `Unknown key: ${key}. Valid keys: ${Object.keys(CONFIG_KEYS).join(', ')}`,
    }
  }

  let parsedValue: string | number | boolean
  if (keyDef.type === 'number') {
    parsedValue = Number(value)
    if (isNaN(parsedValue)) {
      return {
        action: 'set',
        config: loadMergedConfig(store.basePath),
        changed: false,
        message: `Invalid number: ${value}`,
      }
    }
  } else if (keyDef.type === 'boolean') {
    const lower = value.toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(lower)) parsedValue = true
    else if (['false', '0', 'no', 'off'].includes(lower)) parsedValue = false
    else {
      return {
        action: 'set',
        config: loadMergedConfig(store.basePath),
        changed: false,
        message: `Invalid boolean: ${value}. Use true/false/yes/no/1/0`,
      }
    }
  } else {
    if (keyDef.values && !keyDef.values.includes(value)) {
      return {
        action: 'set',
        config: loadMergedConfig(store.basePath),
        changed: false,
        message: `Invalid value for ${key}: ${value}. Valid: ${keyDef.values.join(', ')}`,
      }
    }
    parsedValue = value
  }

  // Load existing stored config, update, save
  const stored = loadStoredConfig(store.basePath)
  const storedRecord = stored as unknown as Record<string, unknown>
  const oldVal = storedRecord[key]
  storedRecord[key] = parsedValue
  saveStoredConfig(store.basePath, stored)

  const merged = { ...DEFAULT_CONFIG, ...stored }
  return {
    action: 'set',
    config: merged,
    changed: true,
    message: `${key}: ${JSON.stringify(oldVal) ?? '(default)'} → ${JSON.stringify(parsedValue)}`,
  }
}

/**
 * Reset config to defaults (removes stored config file).
 */
export function configReset(store: FlyupMemStore): ConfigResult {
  const configPath = path.join(store.basePath, 'config.yaml')
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath)
  }
  return {
    action: 'reset',
    config: { ...DEFAULT_CONFIG },
    changed: true,
    message: 'Config reset to defaults',
  }
}

/**
 * List all available config keys with descriptions.
 */
export function configKeys(): Array<{ key: string; type: string; description: string; default: unknown; values?: string[] }> {
  return Object.entries(CONFIG_KEYS).map(([key, def]) => ({
    key,
    type: def.type,
    description: def.description,
    default: (DEFAULT_CONFIG as unknown as Record<string, unknown>)[key],
    values: def.values,
  }))
}

// ─── Helpers ─────────────────────────────────────────────────

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

function saveStoredConfig(basePath: string, config: Partial<FlyupMemConfig>): void {
  const configPath = path.join(basePath, 'config.yaml')
  fs.mkdirSync(basePath, { recursive: true })
  fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: 120, noRefs: true }), 'utf-8')
}

function loadMergedConfig(basePath: string): FlyupMemConfig {
  return { ...DEFAULT_CONFIG, ...loadStoredConfig(basePath) }
}
