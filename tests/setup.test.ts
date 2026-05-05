// tests/setup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import { flyupSetup } from '../src/tools/flyup_setup.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-setup-'))
}

describe('flyupSetup', () => {
  let tmp: string

  beforeEach(() => {
    tmp = tmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('creates store directory and YAML files', () => {
    const store = new FlyupMemStore({ store_path: tmp })
    const result = flyupSetup(store)

    expect(result.ok).toBe(true)

    // Check all YAML files were created
    const yamlFiles = [
      'engrams.yaml', 'observations.yaml', 'mental-models.yaml',
      'episodes.yaml', 'graph.yaml', 'feedback.yaml', 'schema.yaml',
    ]
    for (const file of yamlFiles) {
      expect(fs.existsSync(path.join(tmp, file))).toBe(true)
    }

    // Check node-version step
    const nodeStep = result.steps.find(s => s.name === 'node-version')!
    expect(nodeStep.status).toBe('ok')
  })

  it('does not overwrite existing files without --force', () => {
    // Write custom content to engrams.yaml
    const customContent = '- id: CUSTOM-001\n  statement: custom\n'
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), customContent, 'utf-8')

    const store = new FlyupMemStore({ store_path: tmp })
    const result = flyupSetup(store, false)

    // File should NOT be overwritten
    const content = fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf-8')
    expect(content).toContain('CUSTOM-001')

    // yaml-files step should report existing files
    const yamlStep = result.steps.find(s => s.name === 'yaml-files')!
    expect(yamlStep.message).toContain('already existed')
  })

  it('overwrites files with --force', () => {
    const customContent = '- id: CUSTOM-001\n  statement: custom\n'
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'engrams.yaml'), customContent, 'utf-8')

    const store = new FlyupMemStore({ store_path: tmp })
    const result = flyupSetup(store, true)

    // File SHOULD be overwritten
    const content = fs.readFileSync(path.join(tmp, 'engrams.yaml'), 'utf-8')
    expect(content).not.toContain('CUSTOM-001')
    expect(content).toBe('[]\n')
  })

  it('reports environment checks', () => {
    const store = new FlyupMemStore({ store_path: tmp })
    const result = flyupSetup(store)

    const names = result.steps.map(s => s.name)
    expect(names).toContain('node-version')
    expect(names).toContain('store-dir')
    expect(names).toContain('yaml-files')
    expect(names).toContain('onnx-runtime')
    expect(names).toContain('hermes-plugin')
    expect(names).toContain('store-path-env')
  })
})
