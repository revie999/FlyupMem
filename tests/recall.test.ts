// tests/recall.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import { flyupLearn } from '../src/tools/flyup_learn.js'
import { flyupRecall } from '../src/tools/flyup_recall.js'
import { flyupStatus } from '../src/tools/flyup_status.js'

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
})
