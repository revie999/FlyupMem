export interface LLMConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
}
export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface LLMResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}
/**
 * Lightweight OpenAI-compatible LLM client.
 * Works with OpenAI, DeepSeek, Xiaomi MiMo, or any compatible endpoint.
 */
export declare class LLMClient {
    private config;
    constructor(config: LLMConfig);
    chat(messages: LLMMessage[]): Promise<LLMResponse>;
    complete(prompt: string, systemPrompt?: string): Promise<string>;
}
/**
 * Create LLM client from environment variables or config.
 */
export declare function createLLMClient(overrides?: Partial<LLMConfig>): LLMClient | null;
//# sourceMappingURL=llm-client.d.ts.map