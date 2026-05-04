// src/tools/flyup_benchmark.ts — deterministic local performance benchmarks

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { performance } from 'node:perf_hooks'
import { FlyupMemStore } from '../core/store.js'
import type { Engram } from '../core/types.js'
import { contentHash } from '../core/hash.js'
import { bm25Search } from '../search/bm25.js'
import { recallWithExplanation } from '../search/recall.js'

export interface BenchmarkOptions {
  /** Memory counts to benchmark. Defaults to 1K/5K/10K. */
  counts?: number[]
  /** Repeated query iterations per scale. Defaults to 3. */
  iterations?: number
  /** Optional benchmark root. A temp dir is used by default. */
  storePath?: string
  /** Queries to run. Defaults to a deterministic mixed English/Chinese set. */
  queries?: string[]
  /** Keep generated benchmark stores on disk. Defaults to false. */
  keepStore?: boolean
}

export interface MetricSummary {
  min: number
  p50: number
  p95: number
  max: number
  avg: number
}

export interface BenchmarkScaleResult {
  count: number
  store_path: string
  populate_ms: number
  save_ms: number
  load_ms: number
  cache_rebuild_ms: number
  fts_search_ms: MetricSummary
  bm25_fallback_ms: MetricSummary
  recall_ms: MetricSummary
  recall_hits: number
  sqlite_indexed: number
  db_size_bytes: number
  yaml_size_bytes: number
}

export interface BenchmarkResult {
  ok: boolean
  generated_at: string
  node: string
  platform: string
  arch: string
  counts: number[]
  iterations: number
  root_path: string
  scales: BenchmarkScaleResult[]
  notes: string[]
}

const DEFAULT_COUNTS = [1000, 5000, 10000]
const DEFAULT_QUERIES = [
  'TypeScript benchmark marker',
  'SQLite 全文搜索 benchmark marker',
  'Graph recall benchmark marker',
]

const TOPICS = [
  'TypeScript benchmark marker improves agent tooling',
  'SQLite full text search benchmark marker accelerates recall',
  'Graph recall benchmark marker connects related memories',
  'Hermes plugin boundary benchmark marker validates integration',
  'FlyupMem YAML source of truth benchmark marker stays editable',
  'BM25 fallback benchmark marker works without embeddings',
  'Memory curation benchmark marker reviews low value records',
  'Git sync benchmark marker protects local first stores',
  'Observation layer benchmark marker consolidates evidence',
  'Mental model benchmark marker summarizes stable preferences',
]

function nowIso(): string {
  return new Date().toISOString()
}

function today(): string {
  return nowIso().slice(0, 10)
}

function round(ms: number): number {
  return Math.round(ms * 100) / 100
}

function measureSync<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now()
  const result = fn()
  return { result, ms: round(performance.now() - start) }
}

async function measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now()
  const result = await fn()
  return { result, ms: round(performance.now() - start) }
}

function summarize(values: number[]): MetricSummary {
  const sorted = [...values].sort((a, b) => a - b)
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * q))] ?? 0
  const sum = sorted.reduce((acc, n) => acc + n, 0)
  return {
    min: round(sorted[0] ?? 0),
    p50: round(pick(0.50)),
    p95: round(pick(0.95)),
    max: round(sorted[sorted.length - 1] ?? 0),
    avg: round(sum / Math.max(1, sorted.length)),
  }
}

function dirSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSizeBytes(p)
    else total += fs.statSync(p).size
  }
  return total
}

function fileSize(filePath: string): number {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
}

export function makeBenchmarkEngram(i: number): Engram {
  const topic = TOPICS[i % TOPICS.length]
  const statement = `${topic}; synthetic memory #${i}; project=flyupmem; shard=${i % 97}`
  return {
    id: `ENG-BENCH-${i.toString().padStart(6, '0')}`,
    version: 1,
    layer: 'raw',
    status: i % 23 === 0 ? 'candidate' : 'active',
    consolidated: false,
    type: i % 5 === 0 ? 'procedural' : 'behavioral',
    memory_class: 'semantic',
    polarity: null,
    commitment: 'exploring',
    scope: i % 7 === 0 ? 'project:flyupmem' : 'global',
    visibility: 'private',
    domain: 'benchmark',
    tags: ['benchmark', `topic-${i % TOPICS.length}`],
    statement,
    rationale: 'Synthetic benchmark memory.',
    contraindications: [],
    entities: [{ name: i % 2 === 0 ? 'FlyupMem' : 'Hermes', type: 'project' }],
    temporal: { learned_at: nowIso(), valid_from: today(), valid_until: null },
    source: { episode_id: null, quote: statement.slice(0, 200), origin: 'benchmark' },
    activation: {
      retrieval_strength: 0.55 + (i % 40) / 100,
      storage_strength: 0.65 + (i % 30) / 100,
      frequency: 1 + (i % 5),
      turn_count: i % 3,
      last_accessed: today(),
    },
    emotional_weight: 5,
    confidence: 6 + (i % 4),
    content_hash: contentHash(statement),
    associations: [],
    feedback: { positive: i % 11 === 0 ? 1 : 0, negative: 0, neutral: 0 },
    adoption_count: i % 13 === 0 ? 1 : 0,
    previous_version_ref: null,
    derivation_count: 1,
  }
}

function populateStore(store: FlyupMemStore, count: number): void {
  for (let i = 0; i < count; i++) {
    store.addEngram(makeBenchmarkEngram(i))
    if (i > 0 && i % 50 === 0) {
      store.addEdge(`ENG-BENCH-${i.toString().padStart(6, '0')}`, `ENG-BENCH-${(i - 1).toString().padStart(6, '0')}`, 'semantic', 0.7)
    }
  }
}

async function benchmarkScale(rootPath: string, count: number, iterations: number, queries: string[]): Promise<BenchmarkScaleResult> {
  const storePath = path.join(rootPath, `scale-${count}`)
  fs.rmSync(storePath, { recursive: true, force: true })
  const store = new FlyupMemStore({ store_path: storePath, sqlite_enabled: true, embedding_enabled: false })
  store.load()

  const { ms: populateMs } = measureSync(() => populateStore(store, count))
  const { ms: saveMs } = measureSync(() => store.save())
  store.cache.close()

  const fresh = new FlyupMemStore({ store_path: storePath, sqlite_enabled: true, embedding_enabled: false })
  const { ms: loadMs } = measureSync(() => fresh.load())
  const { result: rebuildResult, ms: rebuildMs } = measureSync(() => fresh.cache.rebuildFromData({
    engrams: fresh.engrams,
    observations: fresh.observations,
    mentalModels: fresh.mentalModels,
  }))

  const documents = fresh.allMemories().map(m => ({ id: m.id, text: m.statement }))
  const ftsTimes: number[] = []
  const bm25Times: number[] = []
  const recallTimes: number[] = []
  let recallHits = 0

  for (let i = 0; i < iterations; i++) {
    const query = queries[i % queries.length]
    const fts = measureSync(() => fresh.cache.ftsSearch(query, 30))
    ftsTimes.push(fts.ms)

    const bm25 = measureSync(() => bm25Search(query, documents, 30))
    bm25Times.push(bm25.ms)

    const recall = await measureAsync(() => recallWithExplanation(query, fresh, 1200))
    recallTimes.push(recall.ms)
    recallHits += recall.result.memories.length
  }

  const result: BenchmarkScaleResult = {
    count,
    store_path: storePath,
    populate_ms: populateMs,
    save_ms: saveMs,
    load_ms: loadMs,
    cache_rebuild_ms: rebuildMs,
    fts_search_ms: summarize(ftsTimes),
    bm25_fallback_ms: summarize(bm25Times),
    recall_ms: summarize(recallTimes),
    recall_hits: recallHits,
    sqlite_indexed: rebuildResult.indexed,
    db_size_bytes: fileSize(path.join(storePath, 'index.sqlite')),
    yaml_size_bytes: dirSizeBytes(storePath) - fileSize(path.join(storePath, 'index.sqlite')),
  }
  fresh.cache.close()
  return result
}

export async function flyupBenchmark(options: BenchmarkOptions = {}): Promise<BenchmarkResult> {
  const counts = options.counts?.length ? options.counts : DEFAULT_COUNTS
  const iterations = options.iterations ?? 3
  const rootPath = options.storePath ?? fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-benchmark-'))
  fs.mkdirSync(rootPath, { recursive: true })
  const queries = options.queries?.length ? options.queries : DEFAULT_QUERIES

  const scales: BenchmarkScaleResult[] = []
  for (const count of counts) {
    scales.push(await benchmarkScale(rootPath, count, iterations, queries))
  }

  const result: BenchmarkResult = {
    ok: true,
    generated_at: nowIso(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    counts,
    iterations,
    root_path: rootPath,
    scales,
    notes: [
      'Embedding is disabled for this benchmark to measure zero-cost local retrieval path.',
      'SQLite is treated as a rebuildable cache; YAML remains source of truth.',
      'Recall timings include activation persistence according to store config; default write-light mode updates SQLite meta without rewriting YAML.',
    ],
  }

  if (!options.keepStore && !options.storePath) {
    fs.rmSync(rootPath, { recursive: true, force: true })
  }
  return result
}

function bytesMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatBenchmarkMarkdown(result: BenchmarkResult): string {
  const lines = [
    '# FlyupMem Benchmark Report',
    '',
    `- generated_at: ${result.generated_at}`,
    `- node: ${result.node}`,
    `- platform: ${result.platform}/${result.arch}`,
    `- iterations: ${result.iterations}`,
    '',
    '## Results',
    '',
    '| count | populate | save | load | rebuild | FTS p50/p95 | BM25 p50/p95 | recall p50/p95 | hits | sqlite | yaml |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ]

  for (const s of result.scales) {
    lines.push([
      `| ${s.count}`,
      `${s.populate_ms}ms`,
      `${s.save_ms}ms`,
      `${s.load_ms}ms`,
      `${s.cache_rebuild_ms}ms`,
      `${s.fts_search_ms.p50}/${s.fts_search_ms.p95}ms`,
      `${s.bm25_fallback_ms.p50}/${s.bm25_fallback_ms.p95}ms`,
      `${s.recall_ms.p50}/${s.recall_ms.p95}ms`,
      `${s.recall_hits}`,
      `${bytesMb(s.db_size_bytes)}`,
      `${bytesMb(s.yaml_size_bytes)} |`,
    ].join(' | '))
  }

  lines.push('', '## Notes', '')
  for (const note of result.notes) lines.push(`- ${note}`)
  return lines.join('\n')
}

export function parseBenchmarkCounts(value: string | undefined): number[] | undefined {
  if (!value) return undefined
  const counts = value.split(',').map(v => Number(v.trim())).filter(n => Number.isFinite(n) && n > 0)
  return counts.length ? counts : undefined
}
