// src/enhance/llm-client.ts — LLM client abstraction (OpenAI-compatible)

export interface LLMConfig {
  baseUrl: string    // e.g. https://api.openai.com/v1
  apiKey: string
  model: string      // e.g. gpt-4o-mini, deepseek-chat
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

function normalizeTimeoutMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 10_000
  return Math.max(1, Math.floor(value))
}

/**
 * Lightweight OpenAI-compatible LLM client.
 * Works with OpenAI, DeepSeek, Xiaomi MiMo, or any compatible endpoint.
 */
export class LLMClient {
  private config: LLMConfig

  constructor(config: LLMConfig) {
    this.config = {
      maxTokens: 2048,
      temperature: 0.3,
      ...config,
      timeoutMs: normalizeTimeoutMs(config.timeoutMs),
    }
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`
    const timeoutMs = this.config.timeoutMs ?? 10_000
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          messages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        }),
      })
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`LLM request timed out after ${timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`LLM API error ${response.status}: ${text}`)
    }

    const data = await response.json() as any
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    }
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: LLMMessage[] = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: prompt })

    const response = await this.chat(messages)
    return response.content
  }
}

/**
 * Create LLM client from environment variables or config.
 */
export function createLLMClient(overrides?: Partial<LLMConfig>): LLMClient | null {
  const baseUrl = overrides?.baseUrl
    ?? process.env.FLYUP_LLM_BASE_URL
    ?? process.env.OPENAI_BASE_URL
    ?? 'https://api.openai.com/v1'

  const apiKey = overrides?.apiKey
    ?? process.env.FLYUP_LLM_API_KEY
    ?? process.env.OPENAI_API_KEY
    ?? ''

  const model = overrides?.model
    ?? process.env.FLYUP_LLM_MODEL
    ?? 'gpt-4o-mini'

  const envTimeoutMs = Number(process.env.FLYUP_LLM_TIMEOUT_MS)
  const timeoutMs = normalizeTimeoutMs(overrides?.timeoutMs ?? (Number.isFinite(envTimeoutMs) ? envTimeoutMs : undefined))

  if (!apiKey) return null

  return new LLMClient({ baseUrl, apiKey, model, timeoutMs, ...overrides })
}
