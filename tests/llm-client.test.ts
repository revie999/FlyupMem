// tests/llm-client.test.ts
import { describe, it, expect } from 'vitest'
import { LLMClient, createLLMClient } from '../src/enhance/llm-client.js'

describe('LLMClient', () => {
  it('creates client with config', () => {
    const client = new LLMClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
    })
    expect(client).toBeDefined()
  })

  it('createLLMClient returns null without API key', () => {
    const original = process.env.FLYUP_LLM_API_KEY
    delete process.env.FLYUP_LLM_API_KEY
    delete process.env.OPENAI_API_KEY

    const client = createLLMClient()
    expect(client).toBeNull()

    if (original) process.env.FLYUP_LLM_API_KEY = original
  })

  it('createLLMClient returns client with API key', () => {
    const original = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'test-key'

    const client = createLLMClient()
    expect(client).not.toBeNull()

    if (original) {
      process.env.OPENAI_API_KEY = original
    } else {
      delete process.env.OPENAI_API_KEY
    }
  })
})

describe('extractEngramsLLM', () => {
  it('is exported and callable', async () => {
    const mod = await import('../src/enhance/extract-llm.js')
    expect(typeof mod.extractEngramsLLM).toBe('function')
  })
})

describe('reflect', () => {
  it('is exported and callable', async () => {
    const mod = await import('../src/enhance/reflect.js')
    expect(typeof mod.reflect).toBe('function')
  })
})
