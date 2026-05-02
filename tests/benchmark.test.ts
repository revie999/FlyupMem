// tests/benchmark.test.ts — Performance smoke benchmarks at 1K/2.5K/5K scale

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FlyupMemStore } from '../src/core/store.js'
import { bm25Search } from '../src/search/bm25.js'
import { rrfMerge } from '../src/search/rrf.js'
import type { Engram } from '../src/core/types.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-bench-'))
}

const SAMPLE_STATEMENTS = [
  'TypeScript is a typed superset of JavaScript',
  'React uses a virtual DOM for efficient rendering',
  'Node.js enables server-side JavaScript execution',
  'SQLite is an embedded relational database',
  'Docker containers provide process isolation',
  'Kubernetes orchestrates containerized applications',
  'GraphQL provides a flexible query language for APIs',
  'REST APIs use HTTP methods for CRUD operations',
  'WebSockets enable real-time bidirectional communication',
  'OAuth 2.0 provides delegated authorization',
  'JWT tokens encode claims as JSON objects',
  'bcrypt hashes passwords with salt rounds',
  'Redis provides in-memory data structure storage',
  'PostgreSQL supports advanced SQL features',
  'MongoDB stores documents in BSON format',
  'Elasticsearch provides full-text search capabilities',
  'RabbitMQ implements the AMQP messaging protocol',
  'Nginx serves as a reverse proxy and load balancer',
  'Terraform defines infrastructure as code',
  'Ansible automates configuration management',
  'Prometheus collects time-series metrics',
  'Grafana visualizes monitoring dashboards',
  'Jaeger traces distributed request flows',
  'Envoy proxy handles service mesh traffic',
  'gRPC uses Protocol Buffers for serialization',
  'HTTP/2 multiplexes requests over a single connection',
  'TLS 1.3 reduces handshake round trips',
  'CORS policies control cross-origin resource sharing',
  'Content Security Policy prevents XSS attacks',
  'Rate limiting protects APIs from abuse',
  'Circuit breakers prevent cascade failures',
  'Retry logic with exponential backoff handles transient errors',
  'Health checks verify service availability',
  'Blue-green deployments enable zero-downtime releases',
  'Canary deployments gradually roll out changes',
  'Feature flags control runtime behavior',
  'A/B testing compares user experience variants',
  'Observability combines logs, metrics, and traces',
  'Structured logging uses JSON format for machine parsing',
  'Distributed tracing correlates requests across services',
]

function makeEngram(id: number, statement?: string): Engram {
  const stmt = statement ?? SAMPLE_STATEMENTS[id % SAMPLE_STATEMENTS.length]
  return {
    id: `ENG-BENCH-${id.toString().padStart(6, '0')}`,
    version: 1,
    layer: 'raw',
    status: 'active',
    consolidated: false,
    type: 'behavioral',
    memory_class: 'semantic',
    polarity: null,
    commitment: 'exploring',
    scope: 'global',
    visibility: 'private',
    domain: 'benchmark',
    tags: ['bench'],
    statement: `${stmt} [variant ${id}]`,
    rationale: '',
    contraindications: [],
    entities: [],
    temporal: { learned_at: new Date().toISOString(), valid_from: '2026-05-02', valid_until: null },
    source: { episode_id: null, quote: '', origin: 'benchmark' },
    activation: { retrieval_strength: 1.0, storage_strength: 1.0, frequency: 1, last_accessed: '2026-05-02' },
    emotional_weight: 5,
    confidence: 7,
    content_hash: `hash-${id}`,
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    derivation_count: 0,
  }
}

function generateEngrams(count: number): Engram[] {
  const engrams: Engram[] = []
  for (let i = 0; i < count; i++) {
    engrams.push(makeEngram(i))
  }
  return engrams
}

function measureSync<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now()
  const result = fn()
  const ms = performance.now() - start
  return { result, ms }
}

async function measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now()
  const result = await fn()
  const ms = performance.now() - start
  return { result, ms }
}

describe('Performance Benchmarks', { timeout: 60000 }, () => {

  describe('BM25 search scalability', () => {
    for (const count of [100, 500, 1000, 2500, 5000]) {
      it(`BM25 in-memory: ${count} documents`, () => {
        const engrams = generateEngrams(count)
        const documents = engrams.map(e => ({ id: e.id, text: e.statement }))

        const { ms } = measureSync(() => bm25Search('TypeScript JavaScript typed', documents, 30))

        // Log for visibility
        console.log(`  BM25 in-memory (${count} docs): ${ms.toFixed(1)}ms`)

        // Performance target: <300ms for 1K, allow more for larger sets
        if (count <= 1000) {
          expect(ms).toBeLessThan(300)
        } else if (count <= 5000) {
          expect(ms).toBeLessThan(1500)
        } else {
          expect(ms).toBeLessThan(3000)
        }
      })
    }
  })

  describe('FTS5 search scalability', () => {
    let dir: string

    beforeAll(() => { dir = tmpDir() })
    afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }) })

    for (const count of [100, 500, 1000, 2500, 5000]) {
      it(`FTS5 cached: ${count} documents`, () => {
        const storePath = path.join(dir, `fts-${count}`)
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()

        // Bulk insert
        const { ms: insertMs } = measureSync(() => {
          for (let i = 0; i < count; i++) {
            store.addEngram(makeEngram(i))
          }
        })

        // Search via FTS5
        const { ms: searchMs, result } = measureSync(() =>
          store.cache.ftsSearch('TypeScript JavaScript typed', 30)
        )

        console.log(`  FTS5 insert (${count}): ${insertMs.toFixed(1)}ms | search: ${searchMs.toFixed(1)}ms | hits: ${result.length}`)

        // FTS5 search should be fast regardless of document count
        expect(searchMs).toBeLessThan(50)

        store.cache.close()
      })
    }
  })

  describe('Full recall pipeline', () => {
    let dir: string

    beforeAll(() => { dir = tmpDir() })
    afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }) })

    for (const count of [100, 500, 1000]) {
      it(`BM25 + RRF fusion: ${count} memories`, async () => {
        const storePath = path.join(dir, `recall-${count}`)
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()

        // Populate
        for (let i = 0; i < count; i++) {
          store.addEngram(makeEngram(i))
        }

        const allMemories = store.allMemories()
        const documents = allMemories.map(m => ({ id: m.id, text: m.statement }))

        // BM25 + simple RRF (no semantic, no graph)
        const { ms } = await measureAsync(async () => {
          const bm25Results = bm25Search('TypeScript JavaScript typed', documents, 30, store.cache)
          return rrfMerge([bm25Results])
        })

        console.log(`  Full recall BM25+RRF (${count}): ${ms.toFixed(1)}ms`)

        if (count <= 1000) {
          expect(ms).toBeLessThan(300)
        }

        store.cache.close()
      })
    }
  })

  describe('SQLite cache rebuild', () => {
    let dir: string

    beforeAll(() => { dir = tmpDir() })
    afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }) })

    for (const count of [100, 500, 1000, 2500]) {
      it(`rebuildFromData: ${count} items`, () => {
        const storePath = path.join(dir, `rebuild-${count}`)
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()

        // Populate store (writes to cache)
        const { ms: populateMs } = measureSync(() => {
          for (let i = 0; i < count; i++) {
            store.addEngram(makeEngram(i))
          }
        })

        // Force rebuild
        const { ms: rebuildMs, result } = measureSync(() =>
          store.cache.rebuildFromData({
            engrams: store.engrams,
            observations: store.observations,
            mentalModels: store.mentalModels,
          })
        )

        console.log(`  Rebuild (${count}): populate ${populateMs.toFixed(1)}ms | rebuild ${rebuildMs.toFixed(1)}ms | indexed ${result.indexed}`)

        expect(result.indexed).toBe(count)
        store.cache.close()
      })
    }
  })
})
