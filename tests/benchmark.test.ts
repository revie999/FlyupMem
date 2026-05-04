// tests/benchmark.test.ts — Benchmark CLI/tool behavior tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { flyupBenchmark, formatBenchmarkMarkdown } from '../src/tools/flyup_benchmark.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-benchmark-test-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function runBenchmarkCli(args: string[]): string {
  const tsx = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsx')
  return execFileSync(tsx, ['src/index.ts', 'benchmark', ...args], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, FLYUPMEM_STORE_PATH: path.join(dir, 'cli-store') },
    encoding: 'utf-8',
  })
}

function expectBenchmarkCliFailure(args: string[], message: string): void {
  expect(() => runBenchmarkCli(args)).toThrowError(new RegExp(message))
}

describe('flyupBenchmark', { timeout: 30000 }, () => {
  it('benchmarks requested scales and reports key operation timings', async () => {
    const result = await flyupBenchmark({
      storePath: path.join(dir, 'store'),
      counts: [25, 50],
      iterations: 2,
      queries: ['TypeScript benchmark marker'],
    })

    expect(result.ok).toBe(true)
    expect(result.scales.map(s => s.count)).toEqual([25, 50])
    for (const scale of result.scales) {
      expect(scale.populate_ms).toBeGreaterThanOrEqual(0)
      expect(scale.save_ms).toBeGreaterThanOrEqual(0)
      expect(scale.load_ms).toBeGreaterThanOrEqual(0)
      expect(scale.cache_rebuild_ms).toBeGreaterThanOrEqual(0)
      expect(scale.fts_search_ms.p50).toBeGreaterThanOrEqual(0)
      expect(scale.bm25_fallback_ms.p50).toBeGreaterThanOrEqual(0)
      expect(scale.recall_ms.p50).toBeGreaterThanOrEqual(0)
      expect(scale.recall_hits).toBeGreaterThan(0)
    }
  })

  it('formats a markdown report with scale rows', async () => {
    const result = await flyupBenchmark({
      storePath: path.join(dir, 'store'),
      counts: [20],
      iterations: 1,
      queries: ['SQLite benchmark marker'],
    })

    const markdown = formatBenchmarkMarkdown(result)
    expect(markdown).toContain('# FlyupMem Benchmark Report')
    expect(markdown).toContain('20')
    expect(markdown).toContain('recall')
  })

  it('CLI writes JSON output for machine-readable dogfood', () => {
    const stdout = runBenchmarkCli(['--counts', '20', '--iterations', '1', '--format', 'json'])

    const parsed = JSON.parse(stdout)
    expect(parsed.ok).toBe(true)
    expect(parsed.scales[0].count).toBe(20)
  })

  it('CLI rejects invalid counts instead of running default large scales', () => {
    expectBenchmarkCliFailure(['--counts', 'nope', '--iterations', '1'], 'Invalid --counts')
  })

  it('CLI rejects missing or invalid iterations', () => {
    expectBenchmarkCliFailure(['--counts', '20', '--iterations', '--format', 'json'], 'Invalid --iterations')
    expectBenchmarkCliFailure(['--counts', '20', '--iterations', '0'], 'Invalid --iterations')
  })
})
