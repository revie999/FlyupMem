// src/lifecycle/extract.ts — Rule-based engram extraction from conversation

import type { Engram, MemoryType, Polarity } from '../core/types.js'
import { generateId, nextSequence } from '../core/id.js'
import { contentHash } from '../core/hash.js'

interface ExtractionPattern {
  regex: RegExp
  type: MemoryType
  polarity: Polarity
  domain?: string
  tags?: string[]
  statement?: (match: RegExpMatchArray) => string
  confidence?: number
}

const META_INSTRUCTION_MARKERS = [
  'review the conversation above',
  'update the skill library',
  'first-class skill signals',
  'not just memory signals',
  'update the relevant skill',
]

function isMetaInstructionPollution(text: string): boolean {
  const normalized = text.toLowerCase()
  return META_INSTRUCTION_MARKERS.some(marker => normalized.includes(marker))
}

function stripInjectedMemoryContext(text: string): string {
  return text
    .replace(/^\s*\[Replying to:\s*["“][\s\S]*?["”]\]\s*/g, '')
    .replace(/<memory-context>[\s\S]*?<\/memory-context>/gi, '')
    .replace(/<flyupmem-context>[\s\S]*?<\/flyupmem-context>/gi, '')
    .replace(/\[System note:[\s\S]*?\]\s*/gi, '')
    .trim()
}

function redactSensitive(text: string): string {
  return text
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs]|hf|tp)-[A-Za-z0-9_\-]{16,}\b/gu, '[REDACTED_SECRET]')
    .replace(/((?:password|passwd|密码|口令|token|api[_\s-]?key)[：:=\s]+)([^\s，。,'"`]{6,})/giu, '$1[REDACTED_SECRET]')
}

function cleanCapture(text: string): string {
  return text.trim().replace(/[。.!！?？]+$/u, '')
}

const PATTERNS: ExtractionPattern[] = [
  // Secrets and environment facts. Secrets are intentionally redacted.
  {
    regex: /\b(?:sk|ghp|github_pat|xox[baprs]|hf|tp)-[A-Za-z0-9_\-]{16,}\b/u,
    type: 'procedural',
    polarity: 'do',
    domain: 'environment/secrets',
    tags: ['secret', 'redacted'],
    statement: () => '用户配置了 API/token 类密钥；不得保存或复述原始密钥值。',
    confidence: 8,
  },
  {
    regex: /(?:password|passwd|密码|口令|token|api[_\s-]?key)[：:=\s]+([^\s，。,'"`]{6,})/iu,
    type: 'procedural',
    polarity: 'do',
    domain: 'environment/secrets',
    tags: ['secret', 'redacted'],
    statement: () => '用户配置了敏感凭据；不得保存或复述原始凭据值。',
    confidence: 8,
  },
  {
    regex: /(?:port|端口)(?:\s*(?:是|为|=|:|：|on|at))?\s*(\d{4,5})/iu,
    type: 'procedural',
    polarity: 'do',
    domain: 'environment/runtime',
    tags: ['port'],
    statement: match => `运行环境端口是 ${match[1]}。`,
    confidence: 7,
  },
  {
    regex: /(?:代码|项目|仓库|repo|repository).{0,8}(?:放在|位于|路径是|path is|lives in)\s*([~./A-Za-z0-9_\-][^\s，。'"]{2,})/iu,
    type: 'procedural',
    polarity: 'do',
    domain: 'environment/path',
    tags: ['path', 'project'],
    statement: match => `项目路径是 ${match[1]}。`,
    confidence: 7,
  },
  {
    regex: /(https?:\/\/[^\s，。'"`]+(?:\.[^\s，。'"`]+)?)/iu,
    type: 'procedural',
    polarity: 'do',
    domain: 'environment/url',
    tags: ['url'],
    statement: match => `相关 URL 是 ${match[1]}。`,
    confidence: 6,
  },
  {
    regex: /([A-Za-z][\w-]{1,40})\s*(?:是|is)\s*(?:我的|my)\s*(记忆插件|插件|项目|repo|repository|仓库)/iu,
    type: 'architectural',
    polarity: 'do',
    domain: 'project/facts',
    tags: ['project'],
    statement: match => `${match[1]} 是用户的${match[2]}。`,
    confidence: 7,
  },
  {
    regex: /(?:遇到|碰到|when)\s*(.{3,60}?)(?:就|要|should|then)\s*(.{3,80})/iu,
    type: 'procedural',
    polarity: 'do',
    domain: 'knowledge/procedure',
    tags: ['skill', 'procedure'],
    statement: match => `遇到 ${cleanCapture(match[1])} 时，应 ${cleanCapture(match[2])}。`,
    confidence: 6,
  },
  {
    regex: /(?:正确的做法是|正确做法是|the right way is)\s*(.{5,100})/iu,
    type: 'procedural',
    polarity: 'do',
    domain: 'knowledge/procedure',
    tags: ['skill', 'procedure'],
    statement: match => `正确做法是 ${cleanCapture(match[1])}。`,
    confidence: 7,
  },

  // User corrections
  { regex: /不是[，,]?\s*(.{5,})/u, type: 'terminological', polarity: 'dont' },
  { regex: /不对[，,]?\s*(.{5,})/u, type: 'terminological', polarity: 'dont' },
  { regex: /应该\s*(.{5,})/u, type: 'procedural', polarity: 'do' },
  { regex: /以后\s*(.{5,})/u, type: 'behavioral', polarity: 'do' },
  { regex: /记住[：:]\s*(.{5,})/u, type: 'behavioral', polarity: null },
  { regex: /不要\s*(.{5,})/u, type: 'behavioral', polarity: 'dont' },
  {
    regex: /用\s*(\S+)\s*不用\s*(\S+)/u,
    type: 'terminological',
    polarity: 'do',
    domain: 'preferences/tools',
    tags: ['tool-preference'],
    statement: match => `默认使用 ${match[1]}，不要使用 ${match[2]}。`,
  },

  // Preferences
  { regex: /我喜欢\s*(.{3,})/u, type: 'behavioral', polarity: 'do' },
  { regex: /我希望\s*(.{3,})/u, type: 'behavioral', polarity: 'do' },
  { regex: /默认\s*(.{3,})/u, type: 'behavioral', polarity: 'do' },
  { regex: /尽量\s*(.{3,})/u, type: 'behavioral', polarity: 'do' },
  { regex: /别\s*(.{3,})/u, type: 'behavioral', polarity: 'dont' },

  // Decisions
  { regex: /就这样[，,]?\s*(.{3,})/u, type: 'architectural', polarity: 'do' },
  { regex: /定了[，,]?\s*(.{3,})/u, type: 'architectural', polarity: 'do' },
  { regex: /以后都\s*(.{5,})/u, type: 'behavioral', polarity: 'do' },
  { regex: /统一\s*(.{3,})/u, type: 'architectural', polarity: 'do' },

  // English patterns
  {
    regex: /(?:use|prefer)\s+(\S+)\s+(?:instead of|not)\s+(\S+)/i,
    type: 'terminological',
    polarity: 'do',
    domain: 'preferences/tools',
    tags: ['tool-preference'],
    statement: match => `Default to ${match[1]} instead of ${match[2]}.`,
  },
  { regex: /(?:don't|do not)\s+(.{5,})/i, type: 'behavioral', polarity: 'dont' },
  { regex: /(?:remember|note)\s+(?:that\s+)?(.{5,})/i, type: 'behavioral', polarity: null },
  { regex: /(?:always|default to)\s+(.{5,})/i, type: 'behavioral', polarity: 'do' },
]

/**
 * Extract candidate engrams from a (user, assistant) turn pair.
 * Returns raw engrams with status='candidate'.
 */
export function extractEngramsFromTurn(
  userMsg: string,
  assistantMsg: string,
  existingIds: string[] = [],
  origin: string = 'hermes:telegram',
): Omit<Engram, 'content_hash'>[] {
  const results: Omit<Engram, 'content_hash'>[] = []
  const learnableUserMsg = stripInjectedMemoryContext(userMsg)
  if (!learnableUserMsg) return results
  if (isMetaInstructionPollution(learnableUserMsg)) return results
  const sourceQuote = redactSensitive(learnableUserMsg).slice(0, 200)

  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  for (const pattern of PATTERNS) {
    const match = learnableUserMsg.match(pattern.regex)
    if (!match) continue

    const statement = pattern.statement ? pattern.statement(match) : match[0]
    if (results.some(r => r.statement === statement)) continue
    const seq = nextSequence([...existingIds, ...results.map(r => r.id)], 'raw')

    results.push({
      id: generateId('raw', seq),
      version: 1,
      layer: 'raw',
      status: 'candidate',
      consolidated: false,

      type: pattern.type,
      memory_class: 'semantic',
      polarity: pattern.polarity,
      commitment: 'exploring',
      scope: 'global',
      visibility: 'private',
      domain: pattern.domain ?? 'general',
      tags: pattern.tags ?? [],

      statement,
      rationale: '',
      contraindications: [],

      entities: [],
      temporal: {
        learned_at: now,
        valid_from: now,
        valid_until: null,
      },
      source: {
        episode_id: null,
        quote: sourceQuote,
        origin,
      },

      activation: {
        retrieval_strength: 0.8,
        storage_strength: 0.5,
        frequency: 1,
        turn_count: 0,
        last_accessed: today,
      },
      emotional_weight: 5,
      confidence: pattern.confidence ?? 5,

      associations: [],
      feedback: { positive: 0, negative: 0, neutral: 0 },
      adoption_count: 0,
      previous_version_ref: null,
      derivation_count: 1,
    })
  }

  return results
}

/**
 * Promote candidate to active if conditions are met.
 */
export function shouldPromote(
  engram: Engram,
  duplicateCount: number,
): boolean {
  if (engram.status !== 'candidate') return false
  // Same pattern appeared ≥2 times
  if (duplicateCount >= 2) return true
  return false
}
