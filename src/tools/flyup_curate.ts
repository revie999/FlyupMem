// src/tools/flyup_curate.ts — Review and retire low-value/test memories

import type { Engram, Memory } from '../core/types.js'
import type { FlyupMemStore } from '../core/store.js'

export interface ReviewItem {
  id: string
  layer: Memory['layer']
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

const ENGINEERING_FRAGMENT_PATTERNS = [
  /\bbenchmark\b/i,
  /\bpersistence\b/i,
  /\bmutate\b/i,
  /\biterations?\b/i,
  /\bcounts?\b/i,
  /\bNaN\b/,
  /\b\d+K(?:\/\d+K)+\b/i,
]

const MALFORMED_EXTRACTION_PATTERNS = [
  /记住：.*"\s+"好的[）)]?"?$/,
  /默认端口是\s*7897"\s+"好的[）)]?"?$/,
  /怎么还记住这个[？?]?$/,
]

const CONVERSATIONAL_FRAGMENT_PATTERNS = [
  /^别的账号呢[？?]?$/,
  /^不是已经.+[？?]?$/,
  /^不是能自动获取吗[？?]?$/,
  /^应该.+是什么意思[？?]?$/,
]

function sourceText(mem: Memory): string {
  if ('source' in mem) return `${mem.source.quote}\n${mem.source.origin}`
  if ('title' in mem) return mem.title ?? ''
  return ''
}

function isLowContextEngineeringFragment(mem: Memory): boolean {
  const statement = mem.statement.trim()
  if (mem.status !== 'active' && mem.status !== 'candidate') return false
  if (mem.domain !== 'general') return false
  if (mem.tags.length > 0) return false
  if (mem.confidence > 5) return false
  if (statement.length > 80) return false
  return ENGINEERING_FRAGMENT_PATTERNS.some(re => re.test(statement))
}

function isLowContextConversationalFragment(mem: Memory): boolean {
  const statement = mem.statement.trim()
  if (mem.status !== 'active' && mem.status !== 'candidate') return false
  if (mem.domain !== 'general') return false
  if (mem.tags.length > 0) return false
  if (mem.confidence > 5) return false
  if (statement.length > 40) return false
  return CONVERSATIONAL_FRAGMENT_PATTERNS.some(re => re.test(statement))
}

function isMalformedExtractionArtifact(mem: Memory): boolean {
  const texts = [mem.statement, sourceText(mem)]
  if (mem.status !== 'active' && mem.status !== 'candidate') return false
  if (mem.domain !== 'general') return false
  if (mem.tags.length > 0) return false
  return texts.some(text => MALFORMED_EXTRACTION_PATTERNS.some(re => re.test(text)))
}

function includesQuery(mem: Memory, query?: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return [
    mem.id,
    mem.statement,
    sourceText(mem),
    mem.domain,
    ...mem.tags,
  ].some(value => value.toLowerCase().includes(q))
}

function reviewMemory(mem: Memory): ReviewItem | null {
  const reasons: string[] = []
  let score = 0

  if (mem.tags.some(tag => TEST_TAGS.has(tag.toLowerCase()))) {
    reasons.push('dogfood/test tag')
    score += 3
  }
  if (TEST_DOMAINS.has(mem.domain.toLowerCase())) {
    reasons.push('test domain')
    score += 2
  }
  if (/test|benchmark|dogfood/i.test(sourceText(mem))) {
    reasons.push('test source')
    score += 2
  }
  const markerText = `${mem.statement}\n${sourceText(mem)}`
  if (MARKER_PATTERNS.some(re => re.test(markerText))) {
    reasons.push('test marker')
    score += 3
  }
  if (isLowContextEngineeringFragment(mem)) {
    reasons.push('low-context engineering fragment')
    score += 2
  }
  if (isLowContextConversationalFragment(mem)) {
    reasons.push('low-context conversational fragment')
    score += 2
  }
  if (isMalformedExtractionArtifact(mem)) {
    reasons.push('malformed extraction artifact')
    score += 4
  }
  if (mem.status === 'candidate' && mem.confidence <= 4) {
    reasons.push('low-confidence candidate')
    score += 1
  }
  if ('feedback' in mem && mem.feedback.negative > mem.feedback.positive) {
    reasons.push('negative feedback')
    score += 2
  }

  if (!reasons.length) return null
  return {
    id: mem.id,
    layer: mem.layer,
    status: mem.status,
    statement: mem.statement,
    confidence: mem.confidence,
    tags: [...mem.tags],
    domain: mem.domain,
    score,
    reasons,
  }
}

function explicitItem(mem: Memory, reason: string): ReviewItem {
  return {
    id: mem.id,
    layer: mem.layer,
    status: mem.status,
    statement: mem.statement,
    confidence: mem.confidence,
    tags: [...mem.tags],
    domain: mem.domain,
    score: 0,
    reasons: [reason],
  }
}

export function flyupReview(store: FlyupMemStore, options: ReviewOptions = {}): ReviewResult {
  store.load()
  const limit = options.batch ? Number.MAX_SAFE_INTEGER : (options.limit ?? 50)
  const items = store.allMemories()
    .filter(mem => options.includeRetired || mem.status !== 'retired')
    .filter(mem => includesQuery(mem, options.query))
    .map(reviewMemory)
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
    return store.allMemories()
      .filter(mem => wanted.has(mem.id))
      .map(mem => reviewMemory(mem) ?? explicitItem(mem, 'explicit id'))
  }

  if (options.tag) {
    return store.allMemories()
      .filter(mem => mem.tags.includes(options.tag!))
      .filter(mem => includesQuery(mem, options.query))
      .map(mem => reviewMemory(mem) ?? explicitItem(mem, `tag:${options.tag}`))
  }

  return flyupReview(store, { query: options.query }).items
}

function retireMemory(store: FlyupMemStore, mem: Memory, today: string): void {
  const updates = {
    status: 'retired' as const,
    tags: Array.from(new Set([...mem.tags, 'pruned'])),
    temporal: { ...mem.temporal, valid_until: mem.temporal.valid_until ?? today },
  }
  if (mem.layer === 'raw') store.updateEngram(mem.id, updates as Partial<Engram>)
  else if (mem.layer === 'observation') store.updateObservation(mem.id, updates as any)
  else if (mem.layer === 'mental_model') store.updateMentalModel(mem.id, updates as any)
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
      const mem = store.getById(item.id)
      if (!mem) {
        skipped.push({ id: item.id, reason: 'not found' })
        if (options.confirm) confirmDetails.push({ id: item.id, statement: item.statement, action: 'skipped', reason: 'not found' })
        continue
      }
      if (mem.status === 'locked') {
        skipped.push({ id: item.id, reason: 'locked memory is protected' })
        if (options.confirm) confirmDetails.push({ id: item.id, statement: item.statement, action: 'skipped', reason: 'locked' })
        continue
      }
      if (mem.status === 'retired') {
        skipped.push({ id: item.id, reason: 'already retired' })
        if (options.confirm) confirmDetails.push({ id: item.id, statement: item.statement, action: 'skipped', reason: 'already retired' })
        continue
      }
      retireMemory(store, mem, today)
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
