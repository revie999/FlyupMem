// tests/knowledge-pack.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import { flyupLearn } from '../src/tools/flyup_learn.js'
import {
  exportKnowledgePack,
  importKnowledgePack,
  exportKnowledgePackToFile,
  importKnowledgePackFromFile,
} from '../src/enhance/knowledge-pack.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-pack-'))
}

describe('Knowledge Pack', () => {
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

  it('exports empty store as YAML', () => {
    const content = exportKnowledgePack(store, 'yaml')
    expect(content).toContain('version:')
    expect(content).toContain('engrams: []')
  })

  it('exports with data as YAML', () => {
    flyupLearn('记住：端口是 7897', '好的', store)
    flyupLearn('我喜欢简洁回复', '明白', store)

    const content = exportKnowledgePack(store, 'yaml')
    expect(content).toContain('engrams:')
    expect(content).toContain('端口')
    expect(content).toContain('简洁')
  })

  it('exports as JSON', () => {
    flyupLearn('记住：Vitest 用 toMatchObject', '好的', store)

    const content = exportKnowledgePack(store, 'json')
    const parsed = JSON.parse(content)
    expect(parsed.version).toBe('0.3.0')
    expect(parsed.engrams).toHaveLength(1)
    expect(parsed.stats.engrams).toBe(1)
  })

  it('roundtrip: export → import preserves data', () => {
    flyupLearn('记住：端口是 7897', '好的', store)
    flyupLearn('我喜欢简洁回复', '明白', store)

    const originalCount = store.engrams.length
    const content = exportKnowledgePack(store, 'yaml')

    // Create a new store and import
    const dir2 = tmpDir()
    try {
      const store2 = new FlyupMemStore({ store_path: dir2 })
      store2.load()

      const result = importKnowledgePack(store2, content, 'yaml')
      expect(result.imported).toBe(originalCount)
      expect(result.skipped).toBe(0)
      expect(result.errors).toBe(0)
      expect(store2.engrams).toHaveLength(originalCount)
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true })
    }
  })

  it('skips duplicates on import', () => {
    flyupLearn('记住：端口是 7897', '好的', store)
    const content = exportKnowledgePack(store, 'yaml')
    const originalCount = store.engrams.length

    // Import into same store (should skip)
    const result = importKnowledgePack(store, content, 'yaml')
    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(originalCount)
  })

  it('exports/imports via file', () => {
    flyupLearn('记住：Vitest 用 toMatchObject', '好的', store)

    const filePath = path.join(dir, 'export.yaml')
    exportKnowledgePackToFile(store, filePath)
    expect(fs.existsSync(filePath)).toBe(true)

    const dir2 = tmpDir()
    try {
      const store2 = new FlyupMemStore({ store_path: dir2 })
      store2.load()
      const result = importKnowledgePackFromFile(store2, filePath)
      expect(result.imported).toBe(1)
      expect(store2.engrams).toHaveLength(1)
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true })
    }
  })

  it('handles invalid content gracefully', () => {
    const result = importKnowledgePack(store, 'not valid yaml: [[[', 'yaml')
    expect(result.errors).toBe(1)
  })
})
