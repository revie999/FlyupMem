import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Server } from 'node:http'
import { createDashboardServer } from '../src/web/server.js'
import { FlyupMemStore } from '../src/core/store.js'
import type { Experience } from '../src/core/types.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyupmem-dashboard-'))
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') throw new Error('Unexpected listen address')
      resolve(`http://127.0.0.1:${addr.port}`)
    })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
}

function makeExperience(id: string, sourceMemoryIds: string[]): Experience {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  return {
    id,
    layer: 'experience',
    status: 'active',
    scope: 'dashboard-test',
    domain: 'testing',
    tags: ['dashboard', 'experience'],
    title: 'Dashboard evidence chain',
    statement: 'Dashboard should expose Experience evidence chains',
    source_memory_ids: sourceMemoryIds,
    evidence_summary: 'Evidence chain exposed through dashboard API',
    pattern_type: 'workflow',
    occurrence_count: sourceMemoryIds.length,
    first_seen: now,
    last_seen: now,
    confidence: 8,
    trend: 'new',
    activation: { retrieval_strength: 0.8, storage_strength: 1, frequency: 1, turn_count: 1, last_accessed: today },
    emotional_weight: 5,
    entities: [],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    history: [{ event: 'created', at: now, from: sourceMemoryIds }],
  }
}

describe('Dashboard server management APIs', () => {
  let dir: string
  let server: Server
  let baseUrl: string

  beforeEach(async () => {
    dir = tmpDir()
    server = createDashboardServer({ storePath: dir })
    baseUrl = await listen(server)
  })

  afterEach(async () => {
    await close(server)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates manual raw engrams via POST /api/memory', async () => {
    const res = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'Dashboard-created memory should persist', tags: ['dashboard'], scope: 'test' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.memory.layer).toBe('raw')

    const store = new FlyupMemStore({ store_path: dir })
    store.load()
    expect(store.engrams.some(e => e.statement === 'Dashboard-created memory should persist')).toBe(true)
  })

  it('sanitizes invalid numeric fields during manual memory creation and update', async () => {
    const res = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'Invalid numeric values should not become NaN', confidence: 'abc', emotional_weight: 'nope' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.memory.confidence).toBe(7)
    expect(body.memory.emotional_weight).toBe(5)

    const updateRes = await fetch(`${baseUrl}/api/memory`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: body.memory.id, confidence: 'still-bad', emotional_weight: 'bad-too' }),
    })
    expect(updateRes.status).toBe(200)
    const updated = await updateRes.json() as any
    expect(updated.memory.confidence).toBe(7)
    expect(updated.memory.emotional_weight).toBe(5)

    const store = new FlyupMemStore({ store_path: dir })
    store.load()
    const persisted = store.engrams.find(e => e.statement === 'Invalid numeric values should not become NaN')
    expect(persisted).toBeDefined()
    expect(persisted?.confidence).toBe(7)
    expect(persisted?.emotional_weight).toBe(5)
  })

  it('rejects cross-origin and non-json mutation requests', async () => {
    const crossOrigin = await fetch(`${baseUrl}/api/maintain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
      body: JSON.stringify({ mode: 'light' }),
    })
    expect(crossOrigin.status).toBe(403)

    const formPost = await fetch(`${baseUrl}/api/maintain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'mode=light',
    })
    expect(formPost.status).toBe(415)
  })

  it('runs light maintenance via POST /api/maintain', async () => {
    const res = await fetch(`${baseUrl}/api/maintain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'light' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.result.mode).toBe('light')
    expect(body.result.graph).toBeDefined()
  })

  it('supports hybrid search mode and returns diagnostics', async () => {
    await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'Hybrid dashboard search should return diagnostics' }),
    })

    const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent('hybrid dashboard search')}&mode=hybrid&limit=10`)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.mode).toBe('hybrid')
    expect(body.diagnostics).toBeDefined()
    expect(Array.isArray(body.results)).toBe(true)
  })

  it('lists Experiences and expands their evidence chain', async () => {
    const createRes = await fetch(`${baseUrl}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: 'Evidence source memory for dashboard Experience' }),
    })
    const created = await createRes.json() as any

    const store = new FlyupMemStore({ store_path: dir })
    store.load()
    store.addExperience(makeExperience('EXP-DASH-001', [created.memory.id]))
    store.save()

    const listRes = await fetch(`${baseUrl}/api/experiences`)
    expect(listRes.status).toBe(200)
    const list = await listRes.json() as any
    expect(list.total).toBe(1)
    expect(list.experiences[0].id).toBe('EXP-DASH-001')

    const detailRes = await fetch(`${baseUrl}/api/experience?id=EXP-DASH-001`)
    expect(detailRes.status).toBe(200)
    const detail = await detailRes.json() as any
    expect(detail.experience.id).toBe('EXP-DASH-001')
    expect(detail.evidence[0].id).toBe(created.memory.id)
  })
})
