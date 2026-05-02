// src/tools/flyup_curate.ts — Review and retire low-value/test memories

import type { Engram } from '../core/types.js'
import type { FlyupMemStore } from '../core/store.js'

export interface ReviewItem {
  id: string
  status: Engram['status']
  statement: string
  confidence: number
  tags: string[]
  domain: string
  score: number
  reasons: string[]
}

export interface ReviewOptions {
  limit?: number
  includeRetired?: boolean
  query?: string
  batch?: boolean  // no limit — show all candidates
}

export interface ReviewResult {
  ok: boolean
  total: number
  items: ReviewItem[]
  message: string
}

export interface PruneOptions {
  apply?: boolean
  ids?: string[]
  tag?: string
  query?: string
  all?: boolean       // explicit batch: prune all review candidates
  confirm?: boolean   // confirm mode: apply but output per-item details
}

export interface PruneSkipped {
  id: string
  reason: string
}

export interface PruneResult {
  ok: boolean
  applied: boolean
  matched: number
  changed: number
  items: ReviewItem[]
  skipped: PruneSkipped[]
  message: string
  confirm_details?: PruneConfirmItem[]  // present when confirm=true
}

export interface PruneConfirmItem {
  id: string
  statement: string
  action: 'retired' | 'skipped'
  reason: string
}

const TEST_TAGS = new Set(['dogfood', 'test', 'testing', 'smoke', 'benchmark', 'debug'])
const TEST_DOMAINS = new Set(['test', 'testing', 'benchmark', 'dogfood'])
const MARKER_PATTERNS = [
  /\bmarker\b/i,
  /dogfood/i,
  /smoke/i,
  /cli-explain/i,
  /telegram-live/i,
  /hermes-provider-v?\d+/i,
  /\b[a-z]+(?:-[a-z0-9]+){2,}-\d{8,}/i,
]

function includesQuery(e: Engram, query?: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return [
    e.id,
    e.statement,
    e.rationale,
    e.source.quote,
    e.source.origin,
    e.domain,
    ...e.tags,
  ].some(value => value.toLowerCase().includes(q))
}

function reviewEngram(e: Engram): ReviewItem | null {
  const reasons: string[] = []
  let score = 0

  if (e.tags.some(tag => TEST_TAGS.has(tag.toLowerCase()))) {
    reasons.push('dogfood/test tag')
    score += 3
  }
  if (TEST_DOMAINS.has(e.domain.toLowerCase())) {
    reasons.push('test domain')
    score += 2
  }
  if (/test|benchmark|dogfood/i.test(e.source.origin)) {
    reasons.push('test source')
    score += 2
  }
  const markerText = `${e.statement}\n${e.source.quote}`
  if (MARKER_PATTERNS.some(re => re.test(markerText))) {
    reasons.push('test marker')
    score += 3
  }
  if (e.status === 'candidate' && e.confidence <= 4) {
    reasons.push('low-confidence candidate')
    score += 1
  }
  if (e.feedback.negative > e.feedback.positive) {
    reasons.push('negative feedback')
    score += 2
  }

  if (!reasons.length) return null
  return {
    id: e.id,
    status: e.status,
    statement: e.statement,
    confidence: e.confidence,
    tags: [...e.tags],
    domain: e.domain,
    score,
    reasons,
  }
}

export function flyupReview(store: FlyupMemStore, options: ReviewOptions = {}): ReviewResult {
  store.load()
  const limit = options.batch ? Number.MAX_SAFE_INTEGER : (options.limit ?? 50)
  const items = store.engrams
    .filter(e => options.includeRetired || e.status !== 'retired')
    .filter(e => includesQuery(e, options.query))
    .map(reviewEngram)
    .filter((item): item is ReviewItem => item !== null)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)

  return {
    ok: true,
    total: items.length,
    items,
    message: items.length ? `${items.length} memory candidate(s) need review` : 'No review candidates found',
  }
}

function selectForPrune(store: FlyupMemStore, options: PruneOptions): ReviewItem[] {
  if (options.ids?.length) {
    const wanted = new Set(options.ids)
    return store.engrams
      .filter(e => wanted.has(e.id))
      .map(e => reviewEngram(e) ?? {
        id: e.id,
        status: e.status,
        statement: e.statement,
        confidence: e.confidence,
        tags: [...e.tags],
        domain: e.domain,
        score: 0,
        reasons: ['explicit id'],
      })
  }

  if (options.tag) {
    return store.engrams
      .filter(e => e.tags.includes(options.tag!))
      .filter(e => includesQuery(e, options.query))
      .map(e => reviewEngram(e) ?? {
        id: e.id,
        status: e.status,
        statement: e.statement,
        confidence: e.confidence,
        tags: [...e.tags],
        domain: e.domain,
        score: 0,
        reasons: [`tag:${options.tag}`],
      })
  }

  return flyupReview(store, { query: options.query }).items
}

export function flyupPrune(store: FlyupMemStore, options: PruneOptions = {}): PruneResult {
  store.load()

  // --all: explicitly prune all review candidates
  const effectiveOptions = options.all
    ? { ...options, apply: true }
    : options

  const items = selectForPrune(store, effectiveOptions)
  const skipped: PruneSkipped[] = []
  const confirmDetails: PruneConfirmItem[] = []
  let changed = 0

  // --confirm or --all: always apply
  const shouldApply = Boolean(effectiveOptions.apply || options.confirm)

  if (shouldApply) {
    const today = new Date().toISOString().slice(0, 10)
    for (const item of items) {
      const e = store.getEngramById(item.id)
      if (!e) {
        skipped.push({ id: item.id, reason: 'not found' })
        if (options.confirm) confirmDetails.push({ id: item.id, statement: item.statement, action: 'skipped', reason: 'not found' })
        continue
      }
      if (e.status === 'locked') {
        skipped.push({ id: item.id, reason: 'locked memory is protected' })
        if (options.confirm) confirmDetails.push({ id: item.id, statement: item.statement, action: 'skipped', reason: 'locked' })
        continue
      }
      if (e.status === 'retired') {
        skipped.push({ id: item.id, reason: 'already retired' })
        if (options.confirm) confirmDetails.push({ id: item.id, statement: item.statement, action: 'skipped', reason: 'already retired' })
        continue
      }
      store.updateEngram(e.id, {
        status: 'retired',
        tags: Array.from(new Set([...e.tags, 'pruned'])),
        temporal: { ...e.temporal, valid_until: e.temporal.valid_until ?? today },
      })
      changed += 1
      if (options.confirm) confirmDetails.push({ id: item.id, statement: item.statement, action: 'retired', reason: item.reasons.join(', ') })
    }
    if (changed > 0) store.save()
  }

  return {
    ok: true,
    applied: shouldApply,
    matched: items.length,
    changed,
    items,
    skipped,
    message: shouldApply
      ? `Retired ${changed}/${items.length} matched memory candidate(s)`
      : `Dry run: ${items.length} memory candidate(s) would be retired. Re-run with --apply to persist.`,
    ...(options.confirm ? { confirm_details: confirmDetails } : {}),
  }
}
