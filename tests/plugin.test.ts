// tests/plugin.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemPlugin } from '../src/plugins/openclaw.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-plugin-'))
}

describe('FlyupMemPlugin', () => {
  let dir: string
  let plugin: FlyupMemPlugin

  beforeEach(() => {
    dir = tmpDir()
    plugin = new FlyupMemPlugin({
      store_path: dir,
      autoDecay: false, // skip maintenance in tests
      origin: 'test:plugin',
    })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('initializes on startup', async () => {
    await plugin.onStartup()
    const store = plugin.getStore()
    expect(store.engrams).toEqual([])
  })

  it('keeps startup BM25-only by default', async () => {
    const start = Date.now()
    await plugin.onStartup()
    expect(Date.now() - start).toBeLessThan(1000)
    expect(plugin.getStore().config.embedding_enabled).toBe(false)
  })

  it('learns from conversation via onAfterTurn', async () => {
    await plugin.onStartup()
    await plugin.onAfterTurn(
      '不是，Vitest 部分匹配要用 toMatchObject()',
      '明白了，已修正',
    )
    const store = plugin.getStore()
    expect(store.engrams.length).toBeGreaterThanOrEqual(1)
    expect(store.episodes.length).toBeGreaterThanOrEqual(1)
    expect(store.episodes[0].created_engram_ids.length).toBeGreaterThanOrEqual(1)
  })

  it('recalls via onAssemble', async () => {
    await plugin.onStartup()
    await plugin.onAfterTurn('记住：端口是 7897', '好的')

    const injection = await plugin.onAssemble({ query: '端口' })
    expect(injection).toContain('flyupmem-context')
    expect(injection).toContain('7897')
  })

  it('learns directly via learn()', async () => {
    await plugin.onStartup()
    const result = plugin.learn('以后都要用 Vitest 不用 Jest')
    // learn() wraps in "记住：..." pattern which extraction matches
    expect(result.stored).toBeGreaterThanOrEqual(1)
  })

  it('recalls via recall()', async () => {
    await plugin.onStartup()
    plugin.learn('以后都要用 Vitest 不用 Jest')
    const result = await plugin.recall('Vitest')
    expect(result.count).toBeGreaterThan(0)
  })

  it('gives feedback via feedback()', async () => {
    await plugin.onStartup()
    const learnResult = plugin.learn('以后都要用 Vitest 不用 Jest')
    expect(learnResult.stored).toBeGreaterThanOrEqual(1)
    const memId = learnResult.engramIds[0]
    const result = plugin.feedback(memId, 'positive', '有用')
    expect(result.applied).toBe(true)
  })

  it('skips learning when autoLearn is false', async () => {
    const plugin2 = new FlyupMemPlugin({
      store_path: dir,
      autoLearn: false,
      autoDecay: false,
    })
    await plugin2.onStartup()
    await plugin2.onAfterTurn('记住：测试', '好的')
    expect(plugin2.getStore().engrams.length).toBe(0)
  })

  it('skips recall when autoRecall is false', async () => {
    const plugin2 = new FlyupMemPlugin({
      store_path: dir,
      autoRecall: false,
      autoDecay: false,
    })
    await plugin2.onStartup()
    plugin2.learn('测试')
    const injection = await plugin2.onAssemble({ query: '测试' })
    expect(injection).toBe('')
  })

  it('handles onCompact without errors', async () => {
    await plugin.onStartup()
    await plugin.onCompact([
      { role: 'user', content: '记住：compact 测试' },
      { role: 'assistant', content: '好的' },
    ])
    expect(plugin.getStore().engrams.length).toBeGreaterThanOrEqual(1)
    expect(plugin.getStore().episodes.some(ep => ep.kind === 'summary')).toBe(true)
  })

  it('records checkpoints and exposes recovery context', async () => {
    await plugin.onStartup()
    plugin.checkpoint('pr-opened', {
      summary: 'Opened draft PR for memory hardening',
      next_steps: ['review CI'],
    })
    const context = plugin.recoveryContext()
    expect(context).toContain('pr-opened')
    expect(context).toContain('review CI')
  })

  it('handles onScheduled without errors', async () => {
    await plugin.onStartup()
    await expect(plugin.onScheduled()).resolves.not.toThrow()
  })
})
