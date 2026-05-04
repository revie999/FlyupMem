// tests/recall.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { execFileSync } from 'node:child_process'
import { FlyupMemStore } from '../src/core/store.js'
import { flyupLearn } from '../src/tools/flyup_learn.js'
import { flyupRecall } from '../src/tools/flyup_recall.js'
import { flyupStatus } from '../src/tools/flyup_status.js'
import { initEmbedder, isEmbeddingAvailable } from '../src/search/embed.js'
import { recallWithExplanation } from '../src/search/recall.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-integration-'))
}

describe('Integration: learn → recall → status', () => {
  let dir: string
  let store: FlyupMemStore

  beforeEach(() => {
    dir = tmpDir()
    store = new FlyupMemStore({ store_path: dir })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('full roundtrip', async () => {
    // Learn
    const learnResult = flyupLearn(
      '不是，Vitest 部分匹配要用 toMatchObject()',
      '明白了，已记住',
      store,
    )
    expect(learnResult.extracted).toBeGreaterThanOrEqual(1)
    expect(learnResult.stored).toBeGreaterThanOrEqual(1)

    // Learn more
    flyupLearn(
      '我喜欢简洁直接的回复',
      '好的',
      store,
    )

    // Recall
    const recallResult = await flyupRecall('Vitest 匹配', store)
    expect(recallResult.count).toBeGreaterThan(0)
    expect(recallResult.injection).toContain('flyupmem-context')

    // Status
    const status = flyupStatus(store)
    expect(status.stats.engrams.total).toBeGreaterThanOrEqual(1)
    expect(status.health.ok).toBe(true)
  })

  it('dedup skips exact duplicates', () => {
    flyupLearn('记住：端口是 7897', '好的', store)
    const r1 = store.stats().engrams.total

    flyupLearn('记住：端口是 7897', '好的', store)
    const r2 = store.stats().engrams.total

    // Same statement → should not add duplicate
    expect(r2).toBe(r1)
    // But frequency should be bumped
    const eng = store.engrams.find(e => e.statement.includes('端口'))
    expect(eng!.activation.frequency).toBeGreaterThan(1)
  })

  it('does not inject unrelated memories when query has no lexical or temporal match', async () => {
    flyupLearn('记住：主人偏好直接给结论。', '好的', store)

    const recallResult = await flyupRecall('dogfood marker hermes-adapter-smoke-20260501', store)

    expect(recallResult.count).toBe(0)
    expect(recallResult.injection).toContain('(no relevant memories)')
    expect(recallResult.injection).not.toContain('主人偏好直接给结论')
  })

  it('does not inject unrelated memories when semantic search is available', async () => {
    const ready = await initEmbedder({ timeoutMs: 1000 })
    if (!ready || !isEmbeddingAvailable()) return

    flyupLearn('记住：主人偏好直接给结论。', '好的', store)

    const recallResult = await flyupRecall('dogfood marker hermes-adapter-smoke-20260501', store)

    expect(recallResult.count).toBe(0)
    expect(recallResult.injection).not.toContain('主人偏好直接给结论')
  })

  it('does not recall retired memories', async () => {
    flyupLearn('记住：retired recall marker 是 retired-recall-20260504。', '好的', store)
    const mem = store.engrams.find(e => e.statement.includes('retired-recall-20260504'))!
    store.updateEngram(mem.id, {
      status: 'retired',
      tags: [...mem.tags, 'pruned'],
      temporal: { ...mem.temporal, valid_until: new Date().toISOString().slice(0, 10) },
    })
    store.save()

    const result = await recallWithExplanation('retired-recall-20260504', store)

    expect(result.memories.map(m => m.id)).not.toContain(mem.id)
    expect(result.injection).toContain('(no relevant memories)')
  })

  it('explains recall signal scores and final ranking for matched memories', async () => {
    flyupLearn('记住：FlyupMem explain marker 是 recall-explain-20260501。', '好的', store)

    const result = await recallWithExplanation('recall-explain-20260501', store)

    expect(result.injection).toContain('recall-explain-20260501')
    expect(result.explanations.length).toBeGreaterThan(0)
    expect(result.explanations[0]).toMatchObject({
      memory_id: expect.stringMatching(/^ENG-/),
      matched: true,
      signals: {
        bm25: expect.objectContaining({ matched: true, score: expect.any(Number), rank: expect.any(Number) }),
        temporal: expect.objectContaining({ matched: expect.any(Boolean) }),
        graph: expect.objectContaining({ matched: expect.any(Boolean) }),
        semantic: expect.objectContaining({ matched: expect.any(Boolean), available: expect.any(Boolean) }),
      },
      scores: expect.objectContaining({
        rrf: expect.any(Number),
        activation: expect.any(Number),
        activation_weighted: expect.any(Number),
        rerank: expect.any(Number),
      }),
      reason: expect.stringContaining('bm25'),
    })
  })

  it('explains why unrelated queries injected no memories', async () => {
    flyupLearn('记住：主人偏好直接给结论。', '好的', store)

    const result = await recallWithExplanation('蓝色长颈鹿火星煮咖啡 7f3a9z', store)

    expect(result.memories).toEqual([])
    expect(result.injection).toContain('(no relevant memories)')
    expect(result.explanations).toEqual([])
    expect(result.diagnostics.no_results_reason).toContain('No retrieval signals matched')
  })

  it('CLI recall --explain returns structured JSON diagnostics', () => {
    const tsx = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsx')
    execFileSync(tsx, ['src/index.ts', 'learn', '记住：CLI explain marker 是 cli-explain-20260501。', '好的'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, FLYUPMEM_STORE_PATH: dir },
      encoding: 'utf8',
    })

    const stdout = execFileSync(tsx, ['src/index.ts', 'recall', 'cli-explain-20260501', '--explain'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, FLYUPMEM_STORE_PATH: dir },
      encoding: 'utf8',
    })
    const parsed = JSON.parse(stdout)

    expect(parsed.injection).toContain('cli-explain-20260501')
    expect(parsed.explanations[0].signals.bm25.matched).toBe(true)
    expect(parsed.explanations[0].scores.rerank).toEqual(expect.any(Number))
  }, 30000)

  it('default recall does not require semantic embedding initialization', async () => {
    flyupLearn('记住：默认 recall marker 是 bm25-only-20260504。', '好的', store)

    const result = await recallWithExplanation('bm25-only-20260504', store)

    expect(result.diagnostics.semantic_available).toBe(false)
    expect(result.injection).toContain('bm25-only-20260504')
  })

  it('uses write-light recall by default: SQLite activation updates without rewriting YAML', async () => {
    flyupLearn('记住：write-light recall marker 是 write-light-20260504。', '好的', store)
    const mem = store.engrams.find(e => e.statement.includes('write-light-20260504'))!
    const yamlPath = path.join(dir, 'engrams.yaml')
    const beforeYaml = fs.readFileSync(yamlPath, 'utf8')

    const result = await recallWithExplanation('write-light-20260504', store)

    expect(result.injection).toContain('write-light-20260504')
    expect(fs.readFileSync(yamlPath, 'utf8')).toBe(beforeYaml)
    const meta = store.cache.metaGet(mem.id)
    expect(meta?.last_accessed).toBe(new Date().toISOString().slice(0, 10))
  })

  it('preserves SQLite recall activation across store reloads', async () => {
    flyupLearn('记住：sqlite recall persistence marker 是 sqlite-recall-persist-20260504。', '好的', store)
    const mem = store.engrams.find(e => e.statement.includes('sqlite-recall-persist-20260504'))!
    const yamlPath = path.join(dir, 'engrams.yaml')
    const docs = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as any[]
    docs[0].activation.last_accessed = '2000-01-01'
    docs[0].activation.turn_count = 0
    fs.writeFileSync(yamlPath, yaml.dump(docs, { lineWidth: 120, noRefs: true }))
    store.cache.close()

    const fresh = new FlyupMemStore({ store_path: dir })
    fresh.load()
    await recallWithExplanation('sqlite-recall-persist-20260504', fresh)
    expect(fresh.cache.metaGet(mem.id)?.last_accessed).toBe(new Date().toISOString().slice(0, 10))
    fresh.cache.close()

    const reloaded = new FlyupMemStore({ store_path: dir })
    reloaded.load()
    expect(reloaded.cache.metaGet(mem.id)?.last_accessed).toBe(new Date().toISOString().slice(0, 10))
    expect(reloaded.cachedActivationFor(reloaded.getEngramById(mem.id)!).last_accessed).toBe(new Date().toISOString().slice(0, 10))
  })

  it('off recall activation persistence does not mutate YAML through later saves', async () => {
    const offStore = new FlyupMemStore({ store_path: dir, recall_activation_persistence: 'off' })
    flyupLearn('记住：off recall persistence marker 是 off-recall-20260504。', '好的', offStore)
    const yamlPath = path.join(dir, 'engrams.yaml')
    const docs = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as any[]
    docs[0].activation.last_accessed = '2000-01-01'
    docs[0].activation.turn_count = 0
    fs.writeFileSync(yamlPath, yaml.dump(docs, { lineWidth: 120, noRefs: true }))
    offStore.cache.close()

    const fresh = new FlyupMemStore({ store_path: dir, recall_activation_persistence: 'off' })
    fresh.load()
    await recallWithExplanation('off-recall-20260504', fresh)
    fresh.captureCheckpoint('after-off-recall', { summary: 'force save after off recall' })
    fresh.save()

    const after = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as any[]
    expect(after[0].activation.last_accessed).toBe('2000-01-01')
    expect(after[0].activation.turn_count).toBe(0)
  })

  it('can opt into YAML recall activation persistence for durable ACT-R writes', async () => {
    const durableStore = new FlyupMemStore({ store_path: dir, recall_activation_persistence: 'yaml' })
    flyupLearn('记住：durable recall marker 是 durable-recall-20260504。', '好的', durableStore)
    const yamlPath = path.join(dir, 'engrams.yaml')
    const beforeYaml = fs.readFileSync(yamlPath, 'utf8')

    const result = await recallWithExplanation('durable-recall-20260504', durableStore)

    expect(result.injection).toContain('durable-recall-20260504')
    expect(fs.readFileSync(yamlPath, 'utf8')).not.toBe(beforeYaml)
  })
})
