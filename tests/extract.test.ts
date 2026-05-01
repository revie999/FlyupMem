// tests/extract.test.ts
import { describe, it, expect } from 'vitest'
import { extractEngramsFromTurn } from '../src/lifecycle/extract.js'

describe('extractEngramsFromTurn', () => {
  it('extracts Chinese correction pattern', () => {
    const results = extractEngramsFromTurn(
      '不是，Vitest 部分匹配要用 toMatchObject',
      '好的，已修正',
    )
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].polarity).toBe('dont')
    expect(results[0].type).toBe('terminological')
  })

  it('extracts preference pattern', () => {
    const results = extractEngramsFromTurn(
      '我喜欢简洁直接的回复',
      '明白',
    )
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].polarity).toBe('do')
  })

  it('extracts "记住" pattern', () => {
    const results = extractEngramsFromTurn(
      '记住：端口是 7897',
      '好的',
    )
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].statement).toContain('记住')
  })

  it('returns empty for non-matching input', () => {
    const results = extractEngramsFromTurn(
      '今天天气不错',
      '是的，阳光很好',
    )
    expect(results).toEqual([])
  })

  it('does not extract meta skill-maintenance instructions as user memory', () => {
    const results = extractEngramsFromTurn(
      "Review the conversation above and update the skill library. Be ACTIVE — most sessions produce at least one skill update. Phrases like 'don't format like this', 'why are you explaining', 'just give me the answer', 'you always do Y and I hate it', or an explicit 'remember this' are FIRST-CLASS skill signals, not just memory signals. Update the relevant skill(s) to embed the preference so the next session starts already knowing.",
      '',
    )
    expect(results).toEqual([])
  })

  it('generates unique IDs', () => {
    const results = extractEngramsFromTurn(
      '以后都用 Vitest 不用 Jest',
      '好的',
    )
    const ids = results.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
