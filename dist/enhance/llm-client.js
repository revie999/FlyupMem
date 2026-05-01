// src/enhance/llm-client.ts — LLM client abstraction (OpenAI-compatible)
/**
 * Lightweight OpenAI-compatible LLM client.
 * Works with OpenAI, DeepSeek, Xiaomi MiMo, or any compatible endpoint.
 */
export class LLMClient {
    config;
    constructor(config) {
        this.config = {
            maxTokens: 2048,
            temperature: 0.3,
            ...config,
        };
    }
    async chat(messages) {
        const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
                model: this.config.model,
                messages,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`LLM API error ${response.status}: ${text}`);
        }
        const data = await response.json();
        return {
            content: data.choices?.[0]?.message?.content ?? '',
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
            } : undefined,
        };
    }
    async complete(prompt, systemPrompt) {
        const messages = [];
        if (systemPrompt)
            messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });
        const response = await this.chat(messages);
        return response.content;
    }
}
/**
 * Create LLM client from environment variables or config.
 */
export function createLLMClient(overrides) {
    const baseUrl = overrides?.baseUrl
        ?? process.env.FLYUP_LLM_BASE_URL
        ?? process.env.OPENAI_BASE_URL
        ?? 'https://api.openai.com/v1';
    const apiKey = overrides?.apiKey
        ?? process.env.FLYUP_LLM_API_KEY
        ?? process.env.OPENAI_API_KEY
        ?? '';
    const model = overrides?.model
        ?? process.env.FLYUP_LLM_MODEL
        ?? 'gpt-4o-mini';
    if (!apiKey)
        return null;
    return new LLMClient({ baseUrl, apiKey, model, ...overrides });
}
//# sourceMappingURL=llm-client.js.map