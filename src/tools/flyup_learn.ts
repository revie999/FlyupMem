// src/tools/flyup_learn.ts — Learn from conversation

import type { FlyupMemStore } from '../core/store.js'
import type { Engram } from '../core/types.js'
import type { LLMClient } from '../enhance/llm-client.js'
import { extractEngramsFromTurn } from '../lifecycle/extract.js'
import { extractEngramsLLM } from '../enhance/extract-llm.js'
import { applyDedup } from '../lifecycle/dedup.js'
import { contentHash } from '../core/hash.js'

export type LearnExtractor = 'rule' | 'llm'

export interface LearnResult {
  extracted: number
  stored: number
  skipped: number
  engramIds: string[]
  extractor: LearnExtractor
  llmAttempted: boolean
  fallbackUsed: boolean
  errors: string[]
}

export interface LearnEnhancedOptions {
  useLLM?: boolean
  llm?: LLMClient
  origin?: string
  fallbackToRules?: boolean
}

function storeCandidates(
  candidates: Omit<Engram, 'content_hash'>[],
  store: FlyupMemStore,
  meta: Pick<LearnResult, 'extractor' | 'llmAttempted' | 'fallbackUsed' | 'errors'>,
): LearnResult {
  let stored = 0
  let skipped = 0
  const engramIds: string[] = []

  for (const candidate of candidates) {
    const engram = { ...candidate, content_hash: contentHash(candidate.statement) }
    const result = applyDedup(engram as any, store)

    if (result.action === 'ADD') {
      stored++
      engramIds.push(engram.id)
    } else {
      skipped++
      if (result.existingId) engramIds.push(result.existingId)
    }
  }

  return {
    extracted: candidates.length,
    stored,
    skipped,
    engramIds,
    ...meta,
  }
}

function ruleLearnInLock(
  userMsg: string,
  assistantMsg: string,
  store: FlyupMemStore,
  origin: string,
  meta?: Partial<Pick<LearnResult, 'llmAttempted' | 'fallbackUsed' | 'errors'>>,
): LearnResult {
  const existingIds = store.engrams.map(e => e.id)
  const candidates = extractEngramsFromTurn(userMsg, assistantMsg, existingIds, origin)
  return storeCandidates(candidates, store, {
    extractor: 'rule',
    llmAttempted: meta?.llmAttempted ?? false,
    fallbackUsed: meta?.fallbackUsed ?? false,
    errors: meta?.errors ?? [],
  })
}

/**
 * Learn from a conversation turn using the default safe rule-based extractor.
 */
export function flyupLearn(
  userMsg: string,
  assistantMsg: string,
  store: FlyupMemStore,
  origin: string = 'hermes:telegram',
): LearnResult {
  return store.withWriteLock(() => ruleLearnInLock(userMsg, assistantMsg, store, origin))
}

/**
 * Learn from a conversation turn with optional opt-in LLM extraction.
 * LLM output is never stored raw: it must pass extractEngramsLLM validation.
 * If LLM extraction fails or yields no safe facts, rules are used as fallback by default.
 */
export async function flyupLearnEnhanced(
  userMsg: string,
  assistantMsg: string,
  store: FlyupMemStore,
  options: LearnEnhancedOptions = {},
): Promise<LearnResult> {
  const origin = options.origin ?? 'hermes:telegram'
  const fallbackToRules = options.fallbackToRules ?? true

  if (!options.useLLM) {
    return flyupLearn(userMsg, assistantMsg, store, origin)
  }

  if (!options.llm) {
    const errors = ['llm-client-unavailable']
    if (!fallbackToRules) {
      return {
        extracted: 0,
        stored: 0,
        skipped: 0,
        engramIds: [],
        extractor: 'llm',
        llmAttempted: false,
        fallbackUsed: false,
        errors,
      }
    }
    return store.withWriteLock(() => ruleLearnInLock(userMsg, assistantMsg, store, origin, {
      llmAttempted: false,
      fallbackUsed: true,
      errors,
    }))
  }

  const errors: string[] = []
  let llmCandidates: Omit<Engram, 'content_hash'>[] = []

  try {
    const existingIds = store.withWriteLock(() => store.engrams.map(e => e.id))
    llmCandidates = await extractEngramsLLM(userMsg, assistantMsg, options.llm, existingIds, origin)
    if (!llmCandidates.length) errors.push('llm-extraction-empty-or-invalid')
  } catch (err) {
    errors.push(`llm-error: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (llmCandidates.length) {
    return store.withWriteLock(() => storeCandidates(llmCandidates, store, {
      extractor: 'llm',
      llmAttempted: true,
      fallbackUsed: false,
      errors,
    }))
  }

  if (!fallbackToRules) {
    return {
      extracted: 0,
      stored: 0,
      skipped: 0,
      engramIds: [],
      extractor: 'llm',
      llmAttempted: true,
      fallbackUsed: false,
      errors,
    }
  }

  return store.withWriteLock(() => ruleLearnInLock(userMsg, assistantMsg, store, origin, {
    llmAttempted: true,
    fallbackUsed: true,
    errors,
  }))
}
