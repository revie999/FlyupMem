// src/web/server.ts — FlyupMem Web Dashboard Server
// Zero-dependency HTTP server using Node built-in http module

import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import { FlyupMemStore } from '../core/store.js'
import { configShow, configSet, configReset, configKeys } from '../tools/flyup_config.js'
import { computeActivation } from '../lifecycle/decay.js'

export interface DashboardOptions {
  port?: number
  host?: string
  storePath?: string
}

const DEFAULT_PORT = 7860
const DEFAULT_HOST = '127.0.0.1'

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

function html(res: http.ServerResponse, content: string, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(content)
}

function error(res: http.ServerResponse, message: string, status = 400): void {
  json(res, { error: message }, status)
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

export function createDashboardServer(options: DashboardOptions = {}): http.Server {
  const port = options.port ?? DEFAULT_PORT
  const host = options.host ?? DEFAULT_HOST
  const storePath = options.storePath ?? path.join(process.env.HOME ?? '~', '.flyupmem')

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const route = `${req.method} ${url.pathname}`

    try {
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
        if (!q) return json(res, { results: [], query: '' })

        const lower = q.toLowerCase()
        const results = store.allMemories().filter(m => {
          const text = ('statement' in m ? (m as any).statement : '') +
                       ('title' in m ? (m as any).title : '') +
                       (m.tags?.join(' ') ?? '')
          return text.toLowerCase().includes(lower)
        })

        return json(res, { results: results.slice(0, 30), query: q, total: results.length })
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
        const fields = ['statement', 'title', 'rationale', 'scope', 'domain', 'tags', 'confidence', 'status']
        for (const f of fields) {
          if (body[f] !== undefined) (mem as any)[f] = body[f]
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
