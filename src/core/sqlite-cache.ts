// src/core/sqlite-cache.ts — SQLite FTS5 + metadata cache
// YAML is source of truth; SQLite is a rebuildable acceleration layer.

import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Engram, Observation, MentalModel } from './types.js'

export interface SQLiteCacheConfig {
  dbPath: string
  enabled: boolean
}

export interface FTSResult {
  id: string
  rank: number  // FTS5 bm25() score (lower = better match)
}

export interface MetaRow {
  id: string
  layer: string
  status: string
  type: string | null
  scope: string | null
  domain: string | null
  confidence: number
  activation: number
  last_accessed: string | null
  content_hash: string | null
  created_at: string
  updated_at: string
}

const SCHEMA_VERSION = 1

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  id, statement, summary, tags, scope, domain,
  tokenize='trigram'
);

CREATE TABLE IF NOT EXISTS memory_meta (
  id TEXT PRIMARY KEY,
  layer TEXT NOT NULL,
  status TEXT NOT NULL,
  type TEXT,
  scope TEXT,
  domain TEXT,
  confidence INTEGER DEFAULT 5,
  activation REAL DEFAULT 1.0,
  last_accessed TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_vectors (
  id TEXT PRIMARY KEY,
  embedding BLOB,
  layer TEXT
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  signal TEXT NOT NULL,
  context TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_links (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  weight REAL DEFAULT 0.5,
  entity_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, link_type, entity_name)
);

CREATE INDEX IF NOT EXISTS idx_meta_status ON memory_meta(status);
CREATE INDEX IF NOT EXISTS idx_meta_layer ON memory_meta(layer);
CREATE INDEX IF NOT EXISTS idx_meta_scope ON memory_meta(scope);
CREATE INDEX IF NOT EXISTS idx_feedback_memory ON feedback(memory_id);
CREATE INDEX IF NOT EXISTS idx_links_from ON memory_links(from_id);
CREATE INDEX IF NOT EXISTS idx_links_to ON memory_links(to_id);
`

export class SQLiteCache {
  private db: Database.Database | null = null
  private readonly dbPath: string
  private readonly enabled: boolean

  // Prepared statements (cached for performance)
  private stmts!: {
    ftsSearch: Database.Statement
    ftsInsert: Database.Statement
    ftsDelete: Database.Statement
    ftsUpdate: Database.Statement
    metaUpsert: Database.Statement
    metaGet: Database.Statement
    metaDelete: Database.Statement
    metaAll: Database.Statement
    metaCount: Database.Statement
    ftsCount: Database.Statement
    vecUpsert: Database.Statement
    vecGet: Database.Statement
    vecDelete: Database.Statement
    feedbackInsert: Database.Statement
    feedbackGetByMemory: Database.Statement
    linkUpsert: Database.Statement
    linkDelete: Database.Statement
    linkGetFrom: Database.Statement
    linkGetTo: Database.Statement
  }

  constructor(config: SQLiteCacheConfig) {
    this.dbPath = config.dbPath
    this.enabled = config.enabled
  }

  /** Open database and ensure schema exists. */
  open(): void {
    if (!this.enabled) return
    if (this.db) return

    const dir = path.dirname(this.dbPath)
    fs.mkdirSync(dir, { recursive: true })

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')

    // Create tables
    this.db.exec(CREATE_TABLES)

    // Check/set schema version
    const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined
    if (!row) {
      this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION)
    }

    this.prepareStatements()
  }

  private prepareStatements(): void {
    const db = this.db!
    this.stmts = {
      ftsSearch: db.prepare(
        `SELECT id, rank FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rank LIMIT ?`
      ),
      ftsInsert: db.prepare(
        `INSERT INTO memory_fts (id, statement, summary, tags, scope, domain) VALUES (?, ?, ?, ?, ?, ?)`
      ),
      ftsDelete: db.prepare(`DELETE FROM memory_fts WHERE id = ?`),
      ftsUpdate: db.prepare(
        `UPDATE memory_fts SET statement = ?, summary = ?, tags = ?, scope = ?, domain = ? WHERE id = ?`
      ),
      metaUpsert: db.prepare(`
        INSERT INTO memory_meta (id, layer, status, type, scope, domain, confidence, activation, last_accessed, content_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          layer=excluded.layer, status=excluded.status, type=excluded.type,
          scope=excluded.scope, domain=excluded.domain,
          confidence=excluded.confidence, activation=excluded.activation,
          last_accessed=excluded.last_accessed, content_hash=excluded.content_hash,
          updated_at=excluded.updated_at
      `),
      metaGet: db.prepare(`SELECT * FROM memory_meta WHERE id = ?`),
      metaDelete: db.prepare(`DELETE FROM memory_meta WHERE id = ?`),
      metaAll: db.prepare(`SELECT * FROM memory_meta`),
      metaCount: db.prepare(`SELECT count(*) as c FROM memory_meta`),
      ftsCount: db.prepare(`SELECT count(*) as c FROM memory_fts`),
      vecUpsert: db.prepare(`
        INSERT INTO memory_vectors (id, embedding, layer) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET embedding=excluded.embedding, layer=excluded.layer
      `),
      vecGet: db.prepare(`SELECT embedding FROM memory_vectors WHERE id = ?`),
      vecDelete: db.prepare(`DELETE FROM memory_vectors WHERE id = ?`),
      feedbackInsert: db.prepare(
        `INSERT INTO feedback (memory_id, signal, context, created_at) VALUES (?, ?, ?, ?)`
      ),
      feedbackGetByMemory: db.prepare(
        `SELECT * FROM feedback WHERE memory_id = ? ORDER BY created_at DESC`
      ),
      linkUpsert: db.prepare(`
        INSERT INTO memory_links (from_id, to_id, link_type, weight, entity_name, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(from_id, to_id, link_type, entity_name) DO UPDATE SET
          weight=excluded.weight, updated_at=excluded.updated_at
      `),
      linkDelete: db.prepare(
        `DELETE FROM memory_links WHERE from_id = ? AND to_id = ? AND link_type = ?`
      ),
      linkGetFrom: db.prepare(`SELECT * FROM memory_links WHERE from_id = ?`),
      linkGetTo: db.prepare(`SELECT * FROM memory_links WHERE to_id = ?`),
    }
  }

  /** Close database connection. */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /** Whether SQLite cache is available. */
  get isAvailable(): boolean {
    return this.enabled && this.db !== null && !!this.stmts
  }

  // ─── FTS5 operations ─────────────────────────────────────────

  /** Full-text search via FTS5. Returns IDs sorted by relevance (rank ascending). */
  ftsSearch(query: string, limit = 30): FTSResult[] {
    if (!this.isAvailable) return []
    try {
      const rows = this.stmts.ftsSearch.all(query, limit) as Array<{ id: string; rank: number }>
      return rows
    } catch {
      return []
    }
  }

  /** Insert a document into FTS index. */
  ftsInsert(id: string, statement: string, summary: string, tags: string, scope: string, domain: string): void {
    if (!this.isAvailable) return
    this.stmts.ftsInsert.run(id, statement, summary, tags, scope, domain)
  }

  /** Delete a document from FTS index. */
  ftsDelete(id: string): void {
    if (!this.isAvailable) return
    this.stmts.ftsDelete.run(id)
  }

  /** Update a document in FTS index. */
  ftsUpdate(id: string, statement: string, summary: string, tags: string, scope: string, domain: string): void {
    if (!this.isAvailable) return
    this.stmts.ftsUpdate.run(statement, summary, tags, scope, domain, id)
  }

  // ─── Metadata operations ──────────────────────────────────────

  metaUpsert(row: MetaRow): void {
    if (!this.isAvailable) return
    this.stmts.metaUpsert.run(
      row.id, row.layer, row.status, row.type, row.scope, row.domain,
      row.confidence, row.activation, row.last_accessed, row.content_hash,
      row.created_at, row.updated_at,
    )
  }

  metaGet(id: string): MetaRow | undefined {
    if (!this.isAvailable) return undefined
    return this.stmts.metaGet.get(id) as MetaRow | undefined
  }

  metaDelete(id: string): void {
    if (!this.isAvailable) return
    this.stmts.metaDelete.run(id)
  }

  metaAll(): MetaRow[] {
    if (!this.isAvailable) return []
    return this.stmts.metaAll.all() as MetaRow[]
  }

  // ─── Vector operations ────────────────────────────────────────

  vecUpsert(id: string, embedding: Buffer, layer: string): void {
    if (!this.isAvailable) return
    this.stmts.vecUpsert.run(id, embedding, layer)
  }

  vecGet(id: string): Buffer | undefined {
    if (!this.isAvailable) return undefined
    const row = this.stmts.vecGet.get(id) as { embedding: Buffer } | undefined
    return row?.embedding
  }

  vecDelete(id: string): void {
    if (!this.isAvailable) return
    this.stmts.vecDelete.run(id)
  }

  // ─── Feedback operations ──────────────────────────────────────

  feedbackInsert(memoryId: string, signal: string, context: string | null): void {
    if (!this.isAvailable) return
    this.stmts.feedbackInsert.run(memoryId, signal, context, new Date().toISOString())
  }

  feedbackGetByMemory(memoryId: string): Array<{ id: number; memory_id: string; signal: string; context: string | null; created_at: string }> {
    if (!this.isAvailable) return []
    return this.stmts.feedbackGetByMemory.all(memoryId) as Array<{ id: number; memory_id: string; signal: string; context: string | null; created_at: string }>
  }

  // ─── Link operations ──────────────────────────────────────────

  linkUpsert(fromId: string, toId: string, linkType: string, weight: number, entityName: string | null): void {
    if (!this.isAvailable) return
    this.stmts.linkUpsert.run(fromId, toId, linkType, weight, entityName, new Date().toISOString())
  }

  linkDelete(fromId: string, toId: string, linkType: string): void {
    if (!this.isAvailable) return
    this.stmts.linkDelete.run(fromId, toId, linkType)
  }

  linkGetFrom(fromId: string): Array<{ from_id: string; to_id: string; link_type: string; weight: number; entity_name: string | null; updated_at: string }> {
    if (!this.isAvailable) return []
    return this.stmts.linkGetFrom.all(fromId) as Array<{ from_id: string; to_id: string; link_type: string; weight: number; entity_name: string | null; updated_at: string }>
  }

  linkGetTo(toId: string): Array<{ from_id: string; to_id: string; link_type: string; weight: number; entity_name: string | null; updated_at: string }> {
    if (!this.isAvailable) return []
    return this.stmts.linkGetTo.all(toId) as Array<{ from_id: string; to_id: string; link_type: string; weight: number; entity_name: string | null; updated_at: string }>
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /** Extract activation as a numeric value from Activation object. */
  private activationValue(a: { retrieval_strength: number; storage_strength: number; frequency: number }): number {
    return (a.retrieval_strength + a.storage_strength) / 2
  }

  /** Map Engram to FTS + meta row. */
  private engramToRows(e: Engram): { fts: { id: string; statement: string; summary: string; tags: string; scope: string; domain: string }; meta: MetaRow } {
    return {
      fts: {
        id: e.id,
        statement: e.statement,
        summary: e.rationale ?? '',
        tags: (e.tags ?? []).join(' '),
        scope: e.scope ?? '',
        domain: e.domain ?? '',
      },
      meta: {
        id: e.id,
        layer: 'engram',
        status: e.status,
        type: e.type ?? null,
        scope: e.scope ?? null,
        domain: e.domain ?? null,
        confidence: e.confidence ?? 5,
        activation: this.activationValue(e.activation),
        last_accessed: e.activation?.last_accessed ?? null,
        content_hash: e.content_hash ?? null,
        created_at: e.temporal?.learned_at ?? new Date().toISOString(),
        updated_at: e.temporal?.learned_at ?? new Date().toISOString(),
      },
    }
  }

  /** Map Observation to FTS + meta row. */
  private observationToRows(o: Observation): { fts: { id: string; statement: string; summary: string; tags: string; scope: string; domain: string }; meta: MetaRow } {
    return {
      fts: {
        id: o.id,
        statement: o.statement,
        summary: o.title ?? '',
        tags: (o.tags ?? []).join(' '),
        scope: o.scope ?? '',
        domain: o.domain ?? '',
      },
      meta: {
        id: o.id,
        layer: 'observation',
        status: o.status,
        type: null,
        scope: o.scope ?? null,
        domain: o.domain ?? null,
        confidence: o.confidence ?? 5,
        activation: this.activationValue(o.activation),
        last_accessed: o.activation?.last_accessed ?? null,
        content_hash: null,
        created_at: o.temporal?.learned_at ?? o.history?.[0]?.at ?? new Date().toISOString(),
        updated_at: o.temporal?.learned_at ?? new Date().toISOString(),
      },
    }
  }

  /** Map MentalModel to FTS + meta row. */
  private mentalModelToRows(m: MentalModel): { fts: { id: string; statement: string; summary: string; tags: string; scope: string; domain: string }; meta: MetaRow } {
    return {
      fts: {
        id: m.id,
        statement: m.statement,
        summary: m.title ?? '',
        tags: (m.tags ?? []).join(' '),
        scope: m.scope ?? '',
        domain: m.domain ?? '',
      },
      meta: {
        id: m.id,
        layer: 'mental_model',
        status: m.status,
        type: null,
        scope: m.scope ?? null,
        domain: m.domain ?? null,
        confidence: m.confidence ?? 8,
        activation: this.activationValue(m.activation),
        last_accessed: m.activation?.last_accessed ?? null,
        content_hash: null,
        created_at: m.temporal?.learned_at ?? new Date().toISOString(),
        updated_at: m.last_refreshed ?? m.temporal?.learned_at ?? new Date().toISOString(),
      },
    }
  }

  // ─── Rebuild from YAML ────────────────────────────────────────

  /** Full rebuild: clear all tables and re-index from YAML data. */
  rebuildFromData(data: {
    engrams: Engram[]
    observations: Observation[]
    mentalModels: MentalModel[]
  }): { indexed: number } {
    if (!this.isAvailable) return { indexed: 0 }

    const db = this.db!

    const rebuild = db.transaction(() => {
      db.exec('DELETE FROM memory_fts')
      db.exec('DELETE FROM memory_meta')

      let count = 0

      for (const e of data.engrams) {
        const rows = this.engramToRows(e)
        this.stmts.ftsInsert.run(rows.fts.id, rows.fts.statement, rows.fts.summary, rows.fts.tags, rows.fts.scope, rows.fts.domain)
        this.stmts.metaUpsert.run(
          rows.meta.id, rows.meta.layer, rows.meta.status, rows.meta.type,
          rows.meta.scope, rows.meta.domain, rows.meta.confidence, rows.meta.activation,
          rows.meta.last_accessed, rows.meta.content_hash, rows.meta.created_at, rows.meta.updated_at,
        )
        count++
      }

      for (const o of data.observations) {
        const rows = this.observationToRows(o)
        this.stmts.ftsInsert.run(rows.fts.id, rows.fts.statement, rows.fts.summary, rows.fts.tags, rows.fts.scope, rows.fts.domain)
        this.stmts.metaUpsert.run(
          rows.meta.id, rows.meta.layer, rows.meta.status, rows.meta.type,
          rows.meta.scope, rows.meta.domain, rows.meta.confidence, rows.meta.activation,
          rows.meta.last_accessed, rows.meta.content_hash, rows.meta.created_at, rows.meta.updated_at,
        )
        count++
      }

      for (const m of data.mentalModels) {
        const rows = this.mentalModelToRows(m)
        this.stmts.ftsInsert.run(rows.fts.id, rows.fts.statement, rows.fts.summary, rows.fts.tags, rows.fts.scope, rows.fts.domain)
        this.stmts.metaUpsert.run(
          rows.meta.id, rows.meta.layer, rows.meta.status, rows.meta.type,
          rows.meta.scope, rows.meta.domain, rows.meta.confidence, rows.meta.activation,
          rows.meta.last_accessed, rows.meta.content_hash, rows.meta.created_at, rows.meta.updated_at,
        )
        count++
      }

      return count
    })

    const indexed = rebuild()
    return { indexed }
  }

  /** Incremental update: only re-index items whose content_hash changed. */
  incrementalUpdate(data: {
    engrams: Engram[]
    observations: Observation[]
    mentalModels: MentalModel[]
  }): { added: number; updated: number; removed: number } {
    if (!this.isAvailable) return { added: 0, updated: 0, removed: 0 }

    const existingIds = new Set(this.metaAll().map(r => r.id))
    const incomingIds = new Set<string>()
    let added = 0, updated = 0

    const processItem = (
      id: string,
      fts: { statement: string; summary: string; tags: string; scope: string; domain: string },
      meta: MetaRow,
    ) => {
      incomingIds.add(id)
      const existing = this.metaGet(id)

      if (!existing) {
        this.ftsInsert(id, fts.statement, fts.summary, fts.tags, fts.scope, fts.domain)
        this.metaUpsert(meta)
        added++
      } else if (existing.content_hash !== meta.content_hash && meta.content_hash) {
        this.ftsUpdate(id, fts.statement, fts.summary, fts.tags, fts.scope, fts.domain)
        this.metaUpsert(meta)
        updated++
      }
    }

    for (const e of data.engrams) {
      const rows = this.engramToRows(e)
      processItem(e.id, rows.fts, rows.meta)
    }

    for (const o of data.observations) {
      const rows = this.observationToRows(o)
      processItem(o.id, rows.fts, rows.meta)
    }

    for (const m of data.mentalModels) {
      const rows = this.mentalModelToRows(m)
      processItem(m.id, rows.fts, rows.meta)
    }

    // Remove items no longer in YAML
    let removed = 0
    for (const id of Array.from(existingIds)) {
      if (!incomingIds.has(id)) {
        this.ftsDelete(id)
        this.metaDelete(id)
        removed++
      }
    }

    return { added, updated, removed }
  }

  /** Sync a single engram after mutation. */
  syncEngram(e: Engram): void {
    if (!this.isAvailable) return
    const rows = this.engramToRows(e)
    // Upsert: delete + insert (FTS5 doesn't support true upsert)
    this.ftsDelete(e.id)
    this.ftsInsert(rows.fts.id, rows.fts.statement, rows.fts.summary, rows.fts.tags, rows.fts.scope, rows.fts.domain)
    this.metaUpsert(rows.meta)
  }

  /** Sync a single observation after mutation. */
  syncObservation(o: Observation): void {
    if (!this.isAvailable) return
    const rows = this.observationToRows(o)
    this.ftsDelete(o.id)
    this.ftsInsert(rows.fts.id, rows.fts.statement, rows.fts.summary, rows.fts.tags, rows.fts.scope, rows.fts.domain)
    this.metaUpsert(rows.meta)
  }

  /** Sync a single mental model after mutation. */
  syncMentalModel(m: MentalModel): void {
    if (!this.isAvailable) return
    const rows = this.mentalModelToRows(m)
    this.ftsDelete(m.id)
    this.ftsInsert(rows.fts.id, rows.fts.statement, rows.fts.summary, rows.fts.tags, rows.fts.scope, rows.fts.domain)
    this.metaUpsert(rows.meta)
  }

  /** Remove a single item from cache. */
  removeItem(id: string): void {
    if (!this.isAvailable) return
    this.ftsDelete(id)
    this.metaDelete(id)
    this.vecDelete(id)
  }

  /** Get cache statistics. */
  stats(): { ftsRows: number; metaRows: number; vecRows: number; feedbackRows: number; linkRows: number; dbSizeBytes: number } {
    if (!this.isAvailable) return { ftsRows: 0, metaRows: 0, vecRows: 0, feedbackRows: 0, linkRows: 0, dbSizeBytes: 0 }

    const ftsRows = (this.stmts.ftsCount.get() as { c: number }).c
    const metaRows = (this.stmts.metaCount.get() as { c: number }).c
    const vecRows = (this.db!.prepare('SELECT count(*) as c FROM memory_vectors').get() as { c: number }).c
    const feedbackRows = (this.db!.prepare('SELECT count(*) as c FROM feedback').get() as { c: number }).c
    const linkRows = (this.db!.prepare('SELECT count(*) as c FROM memory_links').get() as { c: number }).c

    let dbSizeBytes = 0
    try {
      dbSizeBytes = fs.statSync(this.dbPath).size
    } catch { /* file may not exist yet */ }

    return { ftsRows, metaRows, vecRows, feedbackRows, linkRows, dbSizeBytes }
  }
}
