// src/web/server.ts — FlyupMem Web Dashboard Server
// Zero-dependency HTTP server using Node built-in http module

import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { FlyupMemStore } from '../core/store.js'
import { configShow, configSet, configReset, configKeys } from '../tools/flyup_config.js'
import { flyupMaintain, type MaintainMode } from '../tools/flyup_maintain.js'
import { flyupReflect } from '../tools/flyup_reflect.js'
import { recallWithExplanation } from '../search/recall.js'
import { computeActivation } from '../lifecycle/decay.js'
import { generateId, nextSequence } from '../core/id.js'
import { contentHash } from '../core/hash.js'
import type { Engram } from '../core/types.js'

export interface DashboardOptions {
  port?: number
  host?: string
  storePath?: string
}

const DEFAULT_PORT = 7860
const DEFAULT_HOST = '127.0.0.1'

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function html(res: http.ServerResponse, content: string, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(content)
}

function error(res: http.ServerResponse, message: string, status = 400): void {
  json(res, { error: message }, status)
}

function isMutation(method: string | undefined): boolean {
  return method !== undefined && !['GET', 'HEAD', 'OPTIONS'].includes(method)
}

function isAllowedOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    const originUrl = new URL(origin)
    return originUrl.host === req.headers.host
  } catch {
    return false
  }
}

function isJsonRequest(req: http.IncomingMessage): boolean {
  const contentType = req.headers['content-type']
  return typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
  })
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value ?? fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function createManualEngram(body: Record<string, unknown>, existingIds: string[]): Engram {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const statement = String(body.statement ?? '').trim()
  return {
    id: generateId('raw', nextSequence(existingIds, 'raw')),
    version: 1,
    layer: 'raw',
    status: (body.status === 'candidate' || body.status === 'locked') ? body.status : 'active',
    consolidated: false,
    type: (['behavioral', 'terminological', 'procedural', 'architectural'].includes(String(body.type))) ? body.type as Engram['type'] : 'procedural',
    memory_class: (['semantic', 'episodic', 'procedural', 'metacognitive'].includes(String(body.memory_class))) ? body.memory_class as Engram['memory_class'] : 'semantic',
    polarity: body.polarity === 'dont' ? 'dont' : body.polarity === 'do' ? 'do' : null,
    commitment: (['exploring', 'leaning', 'decided', 'locked'].includes(String(body.commitment))) ? body.commitment as Engram['commitment'] : 'decided',
    scope: String(body.scope ?? 'global'),
    visibility: String(body.visibility ?? 'private'),
    domain: String(body.domain ?? 'manual'),
    tags: stringArray(body.tags),
    statement,
    rationale: String(body.rationale ?? ''),
    contraindications: stringArray(body.contraindications),
    entities: [],
    temporal: { learned_at: now, valid_from: now, valid_until: null },
    source: { episode_id: null, quote: statement, origin: 'dashboard:manual' },
    activation: { retrieval_strength: 0.8, storage_strength: 1.0, frequency: 1, turn_count: 0, last_accessed: today },
    emotional_weight: finiteNumber(body.emotional_weight, 5, 1, 10),
    confidence: finiteNumber(body.confidence, 7, 1, 10),
    content_hash: contentHash(statement),
    associations: [],
    feedback: { positive: 0, negative: 0, neutral: 0 },
    previous_version_ref: null,
    adoption_count: 0,
    derivation_count: 1,
  }
}

export function createDashboardServer(options: DashboardOptions = {}): http.Server {
  const port = options.port ?? DEFAULT_PORT
  const host = options.host ?? DEFAULT_HOST
  const storePath = options.storePath ?? path.join(process.env.HOME ?? '~', '.flyupmem')

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const route = `${req.method} ${url.pathname}`

    try {
      if (isMutation(req.method)) {
        if (!isAllowedOrigin(req)) return error(res, 'Forbidden origin', 403)
        if (!isJsonRequest(req)) return error(res, 'Mutation endpoints require application/json', 415)
      }

      // ─── Dashboard HTML ───────────────────────────────
      if (route === 'GET /' || route === 'GET /dashboard') {
        // Try dist/web first (compiled), then src/web (source)
        const candidates = [
          path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), 'dashboard.html'),
          path.join(storePath, '..', 'projects', 'flyupmem', 'src', 'web', 'dashboard.html'),
          path.join(process.cwd(), 'src', 'web', 'dashboard.html'),
        ]
        let content = ''
        for (const htmlPath of candidates) {
          try { content = fs.readFileSync(htmlPath, 'utf-8'); break } catch { /* next */ }
        }
        if (!content) return error(res, 'dashboard.html not found', 500)
        return html(res, content)
      }

      // ─── API: Stats ───────────────────────────────────
      if (route === 'GET /api/stats') {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const all = store.allMemories()
        return json(res, {
          engrams: store.engrams.length,
          observations: store.observations.length,
          mentalModels: store.mentalModels.length,
          experiences: store.experiences.length,
          episodes: store.episodes.length,
          total: all.length,
          graph: {
            entities: Object.keys(store.graph.entities).length,
            edges: store.graph.edges.length,
          },
          status: {
            active: all.filter(m => m.status === 'active').length,
            candidate: all.filter(m => m.status === 'candidate').length,
            fading: all.filter(m => m.status === 'fading').length,
            dormant: all.filter(m => m.status === 'dormant').length,
            retired: all.filter(m => m.status === 'retired').length,
          },
        })
      }

      // ─── API: List memories ───────────────────────────
      if (route === 'GET /api/memories') {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const layer = url.searchParams.get('layer') ?? 'all'
        const status = url.searchParams.get('status') ?? 'all'
        const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)

        let memories = store.allMemories()
        if (layer !== 'all') memories = memories.filter(m => m.layer === layer)
        if (status !== 'all') memories = memories.filter(m => m.status === status)

        // Sort by last_accessed descending
        memories.sort((a, b) => {
          const aDate = a.temporal?.learned_at ?? a.activation?.last_accessed ?? ''
          const bDate = b.temporal?.learned_at ?? b.activation?.last_accessed ?? ''
          return bDate.localeCompare(aDate)
        })

        return json(res, { memories: memories.slice(0, limit), total: memories.length })
      }

      // ─── API: Single memory detail ────────────────────
      if (route === 'GET /api/memory' && url.searchParams.get('id')) {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const id = url.searchParams.get('id')!
        const mem = store.getById(id)
        if (!mem) return error(res, 'Memory not found', 404)

        // Compute current activation
        const layer = mem.layer
        const ew = ('emotional_weight' in mem) ? (mem as any).emotional_weight ?? 5 : 5
        const activation = ('activation' in mem) ? computeActivation((mem as any).activation, layer as any, ew) : null

        // Find related memories via graph
        const related = store.graph.edges
          .filter(e => e.from === id || e.to === id)
          .map(e => ({
            target: e.from === id ? e.to : e.from,
            type: e.type,
            weight: e.weight,
          }))

        return json(res, { memory: mem, currentActivation: activation, related })
      }

      // ─── API: Search ──────────────────────────────────
      if (route === 'GET /api/search') {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const q = url.searchParams.get('q') ?? ''
        if (!q) return json(res, { results: [], query: '', mode: 'keyword', total: 0 })

        const mode = url.searchParams.get('mode') ?? 'keyword'
        const explain = url.searchParams.get('explain') === 'true'
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '30', 10)))

        if (mode === 'semantic' || mode === 'hybrid') {
          const result = await recallWithExplanation(q, store, 4096, url.searchParams.get('scope'))
          return json(res, {
            results: result.memories.slice(0, limit),
            query: q,
            mode: 'hybrid',
            total: result.memories.length,
            diagnostics: result.diagnostics,
            explanations: explain ? result.explanations : undefined,
          })
        }

        const lower = q.toLowerCase()
        const results = store.allMemories().filter(m => {
          const text = ('statement' in m ? (m as any).statement : '') +
                       ('title' in m ? (m as any).title : '') +
                       (m.tags?.join(' ') ?? '')
          return text.toLowerCase().includes(lower)
        })

        return json(res, { results: results.slice(0, limit), query: q, mode: 'keyword', total: results.length })
      }

      // ─── API: Experience browser ──────────────────────
      if (route === 'GET /api/experiences') {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const status = url.searchParams.get('status') ?? 'all'
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
        let experiences = [...store.experiences]
        if (status !== 'all') experiences = experiences.filter(e => e.status === status)
        experiences.sort((a, b) => (b.last_seen ?? b.temporal?.learned_at ?? '').localeCompare(a.last_seen ?? a.temporal?.learned_at ?? ''))
        return json(res, { experiences: experiences.slice(0, limit), total: experiences.length })
      }

      if (route === 'GET /api/experience' && url.searchParams.get('id')) {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const id = url.searchParams.get('id')!
        const exp = store.experiences.find(e => e.id === id)
        if (!exp) return error(res, 'Experience not found', 404)
        const evidence = exp.source_memory_ids.map(sourceId => store.getById(sourceId)).filter(Boolean)
        return json(res, { experience: exp, evidence })
      }

      // ─── API: Graph data ──────────────────────────────
      if (route === 'GET /api/graph') {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()

        const nodes = Object.entries(store.graph.entities).map(([name, data]) => ({
          id: name,
          type: data.type,
          count: data.memory_ids.length,
        }))

        const edges = store.graph.edges.map(e => ({
          from: e.from,
          to: e.to,
          type: e.type,
          weight: e.weight,
        }))

        return json(res, { nodes, edges })
      }

      // ─── API: Create memory ───────────────────────────
      if (route === 'POST /api/memory') {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const body = await parseBody(req)
        const statement = String(body.statement ?? '').trim()
        if (!statement) return error(res, 'Missing statement')
        const layer = String(body.layer ?? 'raw')
        if (layer !== 'raw') return error(res, 'Manual creation currently supports layer="raw" only')

        const engram = createManualEngram(body, store.engrams.map(e => e.id))
        store.addEngram(engram)
        store.save()
        return json(res, { success: true, memory: engram }, 201)
      }

      // ─── API: Update memory ──────────────────────────────
      if (route === 'PUT /api/memory' || route === 'PATCH /api/memory') {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const body = await parseBody(req)
        const id = body.id as string
        if (!id) return error(res, 'Missing memory id')

        const mem = store.getById(id)
        if (!mem) return error(res, 'Memory not found', 404)

        // Update allowed fields
        const fields = ['statement', 'title', 'rationale', 'scope', 'domain', 'tags', 'status']
        for (const f of fields) {
          if (body[f] !== undefined) (mem as any)[f] = body[f]
        }
        if (body.confidence !== undefined) {
          const current = Number((mem as any).confidence ?? 7)
          ;(mem as any).confidence = finiteNumber(body.confidence, Number.isFinite(current) ? current : 7, 1, 10)
        }
        if (body.emotional_weight !== undefined) {
          const current = Number((mem as any).emotional_weight ?? 5)
          ;(mem as any).emotional_weight = finiteNumber(body.emotional_weight, Number.isFinite(current) ? current : 5, 1, 10)
        }
        store.save()
        return json(res, { success: true, memory: mem })
      }

      // ─── API: Delete memory ───────────────────────────
      if (route === 'DELETE /api/memory') {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const id = url.searchParams.get('id')
        if (!id) return error(res, 'Missing memory id')

        const mem = store.getById(id)
        if (!mem) return error(res, 'Memory not found', 404)

        const layer = (mem as any).layer
        if (layer === 'observation') store.removeObservation(id)
        else if (layer === 'mental_model') store.removeMentalModel(id)
        else if (layer === 'experience') store.removeExperience(id)
        else store.removeEngram(id)
        store.save()
        return json(res, { success: true, deleted: id })
      }

      // ─── API: Batch operations ─────────────────────────
      if (route === 'POST /api/memories/batch') {
        const store = new FlyupMemStore({ store_path: storePath })
        store.load()
        const body = await parseBody(req)
        const ids = body.ids as string[]
        const action = body.action as string // 'retire' | 'delete' | 'activate'
        if (!ids?.length || !action) return error(res, 'Missing ids or action')

        let affected = 0
        for (const id of ids) {
          const mem = store.getById(id)
          if (!mem) continue
          if (action === 'delete') {
            const layer = (mem as any).layer
            if (layer === 'observation') store.removeObservation(id)
            else if (layer === 'mental_model') store.removeMentalModel(id)
            else if (layer === 'experience') store.removeExperience(id)
            else store.removeEngram(id)
            affected++
          } else if (action === 'retire') {
            ;(mem as any).status = 'retired'
            affected++
          } else if (action === 'activate') {
            ;(mem as any).status = 'active'
            affected++
          }
        }
        store.save()
        return json(res, { success: true, affected, action })
      }

      // ─── API: Model status ───────────────────────────────
      if (route === 'GET /api/models') {
        const result: Record<string, unknown> = {}

        // Embedding model status
        try {
          const { isEmbeddingAvailable, getEmbeddingDimension, initEmbedder } = await import('../search/embed.js')
          if (!isEmbeddingAvailable()) await initEmbedder()
          result.embedding = {
            model: 'Xenova/bge-m3',
            available: isEmbeddingAvailable(),
            dimension: getEmbeddingDimension(),
            type: 'local (ONNX)',
            runtime: '@xenova/transformers',
          }
        } catch {
          result.embedding = { model: 'Xenova/bge-m3', available: false, error: 'Module load failed' }
        }

        // LLM status — read from env vars AND config.yaml
        const llmBaseUrl = process.env.FLYUP_LLM_BASE_URL || ''
        const llmModel = process.env.FLYUP_LLM_MODEL || ''
        const llmKey = process.env.FLYUP_LLM_API_KEY || ''

        // Also check config.yaml
        let fileLlmConfig: any = null
        try {
          const configPath = path.join(storePath, 'config.yaml')
          if (fs.existsSync(configPath)) {
            const cfg = yaml.load(fs.readFileSync(configPath, 'utf8')) as any
            fileLlmConfig = cfg?.llm || null
          }
        } catch { /* ignore */ }

        const effectiveBaseUrl = llmBaseUrl || fileLlmConfig?.base_url || ''
        const effectiveModel = llmModel || fileLlmConfig?.model || ''
        const effectiveKey = llmKey || fileLlmConfig?.api_key || ''
        const source = llmKey ? 'env' : fileLlmConfig?.api_key ? 'config.yaml' : 'none'

        result.llm = {
          configured: !!(effectiveBaseUrl || effectiveKey),
          baseUrl: effectiveBaseUrl || '(default: https://api.openai.com/v1)',
          model: effectiveModel || '(default: gpt-4o-mini)',
          hasApiKey: !!effectiveKey,
          source,
          envVars: ['FLYUP_LLM_BASE_URL', 'FLYUP_LLM_MODEL', 'FLYUP_LLM_API_KEY', 'FLYUP_LLM_TIMEOUT_MS'],
        }

        // SQLite status
        try {
          const store = new FlyupMemStore({ store_path: storePath })
          store.load()
          result.storage = {
            storePath: storePath,
            engrams: store.engrams.length,
            observations: store.observations.length,
            mentalModels: store.mentalModels.length,
            experiences: store.experiences.length,
            sqliteEnabled: store.config.sqlite_enabled ?? true,
          }
        } catch {
          result.storage = { storePath, error: 'Failed to load store' }
        }

        return json(res, result)
      }

      // ─── API: Test model connectivity ────────────────────
      if (route === 'POST /api/models/test') {
        const body = await parseBody(req)
        const target = body.target as string // 'embedding' | 'llm'

        if (target === 'embedding') {
          try {
            const { embed, isEmbeddingAvailable, initEmbedder } = await import('../search/embed.js')
            const start = Date.now()
            await initEmbedder()
            const available = isEmbeddingAvailable()
            if (!available) return json(res, { success: false, error: 'Model failed to load' })
            const vec = await embed('test connectivity')
            const elapsed = Date.now() - start
            if (!vec) return json(res, { success: false, error: 'Embed returned null' })
            return json(res, {
              success: true,
              elapsed_ms: elapsed,
              dimension: vec.length,
              sample: Array.from(vec.slice(0, 5)).map(v => v.toFixed(4)),
            })
          } catch (err) {
            return json(res, { success: false, error: (err as Error).message })
          }
        }

        if (target === 'llm') {
          const baseUrl = (body.baseUrl as string) || process.env.FLYUP_LLM_BASE_URL || 'https://api.openai.com/v1'
          const apiKey = (body.apiKey as string) || process.env.FLYUP_LLM_API_KEY || ''
          const model = (body.model as string) || process.env.FLYUP_LLM_MODEL || 'gpt-4o-mini'

          try {
            const start = Date.now()
            const resp = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
              },
              body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }),
              signal: AbortSignal.timeout(15000),
            })
            const elapsed = Date.now() - start
            if (!resp.ok) {
              const errText = await resp.text().catch(() => '')
              return json(res, { success: false, error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` })
            }
            const data = await resp.json() as Record<string, unknown>
            return json(res, {
              success: true,
              elapsed_ms: elapsed,
              model: (data as any).model || model,
              status: resp.status,
            })
          } catch (err) {
            return json(res, { success: false, error: (err as Error).message })
          }
        }

        return error(res, 'Invalid target. Use "embedding" or "llm"')
      }

      // ─── API: Run maintenance ─────────────────────────
      if (route === 'POST /api/maintain') {
        const store = new FlyupMemStore({ store_path: storePath })
        const body = await parseBody(req)
        const mode = String(body.mode ?? 'light') as MaintainMode
        if (!['light', 'deep', 'rem'].includes(mode)) return error(res, 'Invalid mode. Use light, deep, or rem')
        const result = await flyupMaintain(store, { mode })
        return json(res, { success: true, result })
      }

      // ─── API: Run reflect ─────────────────────────────
      if (route === 'POST /api/reflect') {
        const store = new FlyupMemStore({ store_path: storePath })
        const body = await parseBody(req)
        const query = String(body.query ?? '').trim()
        if (!query) return error(res, 'Missing query')
        const result = await flyupReflect(query, store)
        return json(res, result, result.success ? 200 : 400)
      }

      // ─── API: Config ──────────────────────────────────
      if (route === 'GET /api/config') {
        const store = new FlyupMemStore({ store_path: storePath })
        const result = configShow(store)
        const keys = configKeys()
        return json(res, { config: result.config, keys })
      }

      if (route === 'POST /api/config') {
        const store = new FlyupMemStore({ store_path: storePath })
        const body = await parseBody(req)
        const key = body.key as string
        const value = body.value as string
        if (!key || value === undefined) return error(res, 'Missing key or value')
        const result = configSet(store, key, String(value))
        return json(res, result)
      }

      if (route === 'POST /api/config/reset') {
        const store = new FlyupMemStore({ store_path: storePath })
        const result = configReset(store)
        return json(res, result)
      }

      // ─── 404 ──────────────────────────────────────────
      error(res, 'Not found', 404)
    } catch (err) {
      error(res, (err as Error).message, 500)
    }
  })

  return server
}

export function startDashboard(options: DashboardOptions = {}): Promise<{ port: number; url: string }> {
  const port = options.port ?? DEFAULT_PORT
  const host = options.host ?? DEFAULT_HOST
  const server = createDashboardServer(options)

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const url = `http://${host}:${port}`
      resolve({ port, url })
    })
  })
}
