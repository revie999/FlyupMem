// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import { configShow, configSet, configReset, configKeys } from '../src/tools/flyup_config.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-config-'))
}

describe('flyupConfig', () => {
  let tmp: string
  let store: FlyupMemStore

  beforeEach(() => {
    tmp = tmpDir()
    store = new FlyupMemStore({ store_path: tmp })
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('configShow returns defaults when no config.yaml exists', () => {
    const result = configShow(store)
    expect(result.action).toBe('show')
    expect(result.config.store_path).toBe('~/.flyupmem')
    expect(result.config.decay_enabled).toBe(true)
    expect(result.config.consolidation_enabled).toBe(true)
    expect(result.config.log_level).toBe('info')
  })

  it('configSet creates config.yaml and sets value', () => {
    const result = configSet(store, 'log_level', 'debug')
    expect(result.changed).toBe(true)
    expect(result.message).toContain('log_level')
    expect(result.message).toContain('debug')
    expect(result.config.log_level).toBe('debug')

    // Verify file was created
    expect(fs.existsSync(path.join(tmp, 'config.yaml'))).toBe(true)
  })

  it('configSet persists across store reloads', () => {
    configSet(store, 'decay_enabled', 'false')
    const freshStore = new FlyupMemStore({ store_path: tmp })
    const result = configShow(freshStore)
    expect(result.config.decay_enabled).toBe(false)
    expect(freshStore.config.decay_enabled).toBe(false)
  })

  it('supports recall activation persistence mode config', () => {
    const result = configSet(store, 'recall_activation_persistence', 'yaml')
    expect(result.changed).toBe(true)
    expect(result.config.recall_activation_persistence).toBe('yaml')

    const freshStore = new FlyupMemStore({ store_path: tmp })
    expect(freshStore.config.recall_activation_persistence).toBe('yaml')
  })

  it('configSet rejects unknown keys', () => {
    const result = configSet(store, 'unknown_key', 'value')
    expect(result.changed).toBe(false)
    expect(result.message).toContain('Unknown key')
  })

  it('configSet rejects invalid numbers', () => {
    const result = configSet(store, 'max_engrams_per_file', 'not_a_number')
    expect(result.changed).toBe(false)
    expect(result.message).toContain('Invalid number')
  })

  it('configSet rejects invalid booleans', () => {
    const result = configSet(store, 'decay_enabled', 'maybe')
    expect(result.changed).toBe(false)
    expect(result.message).toContain('Invalid boolean')
  })

  it('configSet accepts boolean variants', () => {
    configSet(store, 'decay_enabled', 'yes')
    expect(configShow(store).config.decay_enabled).toBe(true)
    configSet(store, 'decay_enabled', '0')
    expect(configShow(store).config.decay_enabled).toBe(false)
  })

  it('configSet validates enum values', () => {
    const result = configSet(store, 'log_level', 'verbose')
    expect(result.changed).toBe(false)
    expect(result.message).toContain('Invalid value')
  })

  it('configReset removes config.yaml and restores defaults', () => {
    configSet(store, 'log_level', 'debug')
    expect(fs.existsSync(path.join(tmp, 'config.yaml'))).toBe(true)

    const result = configReset(store)
    expect(result.changed).toBe(true)
    expect(result.config.log_level).toBe('info')
    expect(fs.existsSync(path.join(tmp, 'config.yaml'))).toBe(false)
  })

  it('configKeys returns all available keys', () => {
    const keys = configKeys()
    const names = keys.map(k => k.key)
    expect(names).toContain('store_path')
    expect(names).toContain('decay_enabled')
    expect(names).toContain('log_level')
    expect(names).toContain('max_engrams_per_file')
    expect(names).toContain('embedding_enabled')
    // Each key should have type and description
    for (const k of keys) {
      expect(k.type).toBeTruthy()
      expect(k.description).toBeTruthy()
      expect(k.default !== undefined).toBe(true)
    }
  })
})
