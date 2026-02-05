/**
 * Tests for the OpenAI-compatible provider implementation.
 * Run with: npx vitest run src/test/ai-providers-openai-compatible.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createOpenAICompatibleClient,
    testOpenAICompatibleConnection,
    parseOpenAICompatibleError,
    openaiCompatibleProvider,
} from '../ai/providers/openai-compatible';

let mockList: ReturnType<typeof vi.fn>;

vi.mock('openai', () => {
    class MockAPIError extends Error {
        status: number;
        constructor(message: string, status: number) {
            super(message);
            this.status = status;
            this.name = 'APIError';
        }
    }

    mockList = vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
            yield { id: 'llama3:latest', object: 'model' };
            yield { id: 'mistral', object: 'model' };
        },
    });

    return {
        __mockList: mockList,
        default: class MockOpenAI {
            static APIError = MockAPIError;

            constructor(public options: { apiKey: string; baseURL?: string; timeout?: number; dangerouslyAllowBrowser?: boolean }) {}

            models = {
                list: mockList,
            };
        },
    };
});

describe('OpenAI-Compatible Provider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should expose required AIProvider fields', () => {
        expect(openaiCompatibleProvider.name).toBe('openai-compatible');
        expect(typeof openaiCompatibleProvider.createClient).toBe('function');
        expect(typeof openaiCompatibleProvider.streamAgentActions).toBe('function');
        expect(typeof openaiCompatibleProvider.testConnection).toBe('function');
        expect(typeof openaiCompatibleProvider.parseError).toBe('function');
    });

    it('should create client with default baseURL and ollama placeholder key', () => {
        const client = createOpenAICompatibleClient('') as unknown as { options: { apiKey: string; baseURL?: string; timeout?: number; dangerouslyAllowBrowser?: boolean } };

        expect(client.options.apiKey).toBe('ollama');
        expect(client.options.baseURL).toBe('http://localhost:11434/v1');
        expect(client.options.timeout).toBe(60000);
        expect(client.options.dangerouslyAllowBrowser).toBe(true);
    });

    it('should create client with custom baseURL', () => {
        const client = createOpenAICompatibleClient('test-key', 'http://example.com/v1') as unknown as { options: { baseURL?: string } };
        expect(client.options.baseURL).toBe('http://example.com/v1');
    });

    it('should return models on successful connection test', async () => {
        const result = await testOpenAICompatibleConnection('', 'http://localhost:11434/v1');

        expect(result.success).toBe(true);
        expect(result.models).toBeDefined();
        expect(result.models?.length).toBe(2);
        expect(result.models?.[0].id).toBe('llama3:latest');
    });

    it('should return error for invalid base URL', async () => {
        const result = await testOpenAICompatibleConnection('', 'not-a-url');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid endpoint URL');
    });

    it('should map 401 errors to invalid_api_key', async () => {
        const OpenAI = (await import('openai')).default as unknown as { APIError: new (message: string, status: number) => Error };
        const error = new OpenAI.APIError('Unauthorized', 401);
        const parsed = parseOpenAICompatibleError(error);

        expect(parsed.type).toBe('invalid_api_key');
        expect(parsed.retryable).toBe(false);
        expect(parsed.provider).toBe('openai-compatible');
    });

    it('should map 429 errors to rate_limit', async () => {
        const OpenAI = (await import('openai')).default as unknown as { APIError: new (message: string, status: number) => Error };
        const error = new OpenAI.APIError('Rate limit', 429);
        const parsed = parseOpenAICompatibleError(error);

        expect(parsed.type).toBe('rate_limit');
        expect(parsed.retryable).toBe(true);
        expect(parsed.provider).toBe('openai-compatible');
    });

    it('should map network errors to network_error', () => {
        const parsed = parseOpenAICompatibleError(new Error('Network error'));
        expect(parsed.type).toBe('network_error');
        expect(parsed.retryable).toBe(true);
        expect(parsed.provider).toBe('openai-compatible');
    });
});
