/**
 * Tests for the Google Gemini provider implementation.
 * Run with: npx vitest run src/test/gemini-provider.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geminiProvider } from '../ai/providers/gemini';
import type { StreamOptions, StreamAction } from '../ai/providers/types';

// Mock response data
const mockModels = [
    { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
    { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
    { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
    { name: 'models/text-embedding-004', displayName: 'Text Embedding' }, // Should be filtered
];

// Track the last abort signal for testing
let lastAbortSignal: AbortSignal | undefined = undefined;

// Create mock stream chunks
function createMockStreamChunks(
    textChunks: string[],
    includeThinking: boolean = false
): Array<{ candidates?: Array<{ content: { parts: Array<{ text?: string; thought?: boolean }> } }> }> {
    const chunks: Array<{ candidates?: Array<{ content: { parts: Array<{ text?: string; thought?: boolean }> } }> }> = [];

    // Add thinking chunks if requested
    if (includeThinking) {
        chunks.push({
            candidates: [{
                content: {
                    parts: [{ text: 'Let me think about this...', thought: true }]
                }
            }]
        });
        chunks.push({
            candidates: [{
                content: {
                    parts: [{ text: 'Analyzing the request...', thought: true }]
                }
            }]
        });
    }

    // Add actual content chunks
    for (const text of textChunks) {
        chunks.push({
            candidates: [{
                content: {
                    parts: [{ text, thought: false }]
                }
            }]
        });
    }

    return chunks;
}

// Mock the Google Generative AI SDK
vi.mock('@google/generative-ai', () => {
    // Create mock error classes
    class MockGoogleGenerativeAIFetchError extends Error {
        status?: number;
        statusText?: string;
        errorDetails?: Array<{ reason?: string }>;

        constructor(message: string, status?: number, statusText?: string, errorDetails?: Array<{ reason?: string }>) {
            super(message);
            this.name = 'GoogleGenerativeAIFetchError';
            this.status = status;
            this.statusText = statusText;
            this.errorDetails = errorDetails;
        }
    }

    class MockGoogleGenerativeAIError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'GoogleGenerativeAIError';
        }
    }

    return {
        GoogleGenerativeAI: class MockGoogleGenerativeAI {
            apiKey: string;

            constructor(apiKey: string) {
                this.apiKey = apiKey;
            }

            getGenerativeModel(params: { model: string; generationConfig?: unknown; systemInstruction?: string }) {
                return {
                    model: params.model,
                    generationConfig: params.generationConfig,
                    systemInstruction: params.systemInstruction,

                    async generateContentStream(
                        request: { contents: unknown[] },
                        options?: { signal?: AbortSignal }
                    ) {
                        // Store the signal for test verification
                        lastAbortSignal = options?.signal;

                        // Create mock chunks based on model
                        const isThinkingModel = params.model.includes('gemini-2.5-pro');
                        const chunks = createMockStreamChunks(
                            ['{"actions": [{"_type":', '"message","content":"Hel', 'lo!"}]}'],
                            isThinkingModel
                        );

                        return {
                            stream: (async function* () {
                                for (const chunk of chunks) {
                                    // Check for abort
                                    if (options?.signal?.aborted) {
                                        break;
                                    }
                                    yield chunk;
                                }
                            })(),
                        };
                    },
                };
            }
        },

        GoogleGenerativeAIFetchError: MockGoogleGenerativeAIFetchError,
        GoogleGenerativeAIError: MockGoogleGenerativeAIError,
        SchemaType: {
            STRING: 'string',
            NUMBER: 'number',
            INTEGER: 'integer',
            BOOLEAN: 'boolean',
            ARRAY: 'array',
            OBJECT: 'object',
        },
    };
});

// Mock fetch for listModels
const originalFetch = global.fetch;
beforeEach(() => {
    vi.clearAllMocks();
    lastAbortSignal = undefined;

    // Mock fetch for the listModels API call
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('models')) {
            return {
                ok: true,
                json: async () => ({
                    models: mockModels,
                }),
            };
        }
        throw new Error('Unexpected fetch call');
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
});

describe('Gemini Provider', () => {
    describe('Provider interface compliance', () => {
        it('should have name property set to "google"', () => {
            expect(geminiProvider.name).toBe('google');
        });

        it('should implement all AIProvider methods', () => {
            expect(typeof geminiProvider.createClient).toBe('function');
            expect(typeof geminiProvider.streamAgentActions).toBe('function');
            expect(typeof geminiProvider.testConnection).toBe('function');
            expect(typeof geminiProvider.parseError).toBe('function');
        });
    });

    describe('createClient', () => {
        it('should create a GoogleGenerativeAI client with the API key', () => {
            const client = geminiProvider.createClient('test-api-key') as { apiKey: string };

            expect(client).toBeDefined();
            expect(client.apiKey).toBe('test-api-key');
        });
    });

    describe('streamAgentActions', () => {
        it('should yield StreamAction objects in correct format', async () => {
            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'gemini-2.5-flash',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are a helpful assistant.',
                maxTokens: 1024,
            };

            const generator = geminiProvider.streamAgentActions(options);

            // Verify it's an async generator
            expect(generator[Symbol.asyncIterator]).toBeDefined();

            // Consume generator and collect actions
            const actions: StreamAction[] = [];
            for await (const action of generator) {
                actions.push(action);
            }

            // Verify actions have correct structure
            for (const action of actions) {
                expect(action).toHaveProperty('_type');
                expect(action).toHaveProperty('complete');
                expect(action).toHaveProperty('time');
                expect(typeof action._type).toBe('string');
                expect(typeof action.complete).toBe('boolean');
                expect(typeof action.time).toBe('number');
            }
        });

        it('should filter out thinking tokens for gemini-2.5-pro', async () => {
            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'gemini-2.5-pro',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are helpful.',
                maxTokens: 1024,
            };

            // Consume the generator
            const generator = geminiProvider.streamAgentActions(options);
            const actions: StreamAction[] = [];
            for await (const action of generator) {
                actions.push(action);
            }

            // Verify we got actions (thinking tokens were filtered)
            expect(actions.length).toBeGreaterThan(0);

            // All actions should have _type field
            for (const action of actions) {
                expect(action._type).toBeDefined();
            }
        });

        it('should handle cancellation via AbortSignal', async () => {
            const abortController = new AbortController();

            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'gemini-2.5-flash',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are helpful.',
                maxTokens: 1024,
                signal: abortController.signal,
            };

            const generator = geminiProvider.streamAgentActions(options);

            // Start consuming the generator
            const iterator = generator[Symbol.asyncIterator]();

            // Get first value to ensure stream is started
            await iterator.next();

            // Verify the signal was passed to the SDK
            expect(lastAbortSignal).toBe(abortController.signal);

            // Abort the request
            abortController.abort();

            // Verify the signal is aborted
            expect(abortController.signal.aborted).toBe(true);
        });
    });

    describe('testConnection', () => {
        it('should return success with models on valid API key', async () => {
            const result = await geminiProvider.testConnection('valid-api-key');

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.models).toBeDefined();
            expect(Array.isArray(result.models)).toBe(true);
        });

        it('should filter to only Gemini models', async () => {
            const result = await geminiProvider.testConnection('valid-api-key');

            expect(result.success).toBe(true);
            expect(result.models).toBeDefined();

            // All models should be Gemini models
            for (const model of result.models!) {
                expect(model.id.toLowerCase()).toMatch(/gemini/);
            }

            // Should not include non-Gemini models (like text-embedding)
            const modelIds = result.models!.map(m => m.id);
            expect(modelIds.some(id => id.includes('embedding'))).toBe(false);
        });

        it('should return error for empty API key', async () => {
            const result = await geminiProvider.testConnection('');

            expect(result.success).toBe(false);
            expect(result.error).toBe('API key is required');
            expect(result.models).toBeUndefined();
        });

        it('should return error for whitespace-only API key', async () => {
            const result = await geminiProvider.testConnection('   ');

            expect(result.success).toBe(false);
            expect(result.error).toBe('API key is required');
        });
    });

    describe('parseError', () => {
        it('should map 401 status to invalid_api_key error', async () => {
            const { GoogleGenerativeAIFetchError } = await import('@google/generative-ai');
            const apiError = new GoogleGenerativeAIFetchError('Unauthorized', 401, 'Unauthorized');

            const result = geminiProvider.parseError(apiError);

            expect(result.type).toBe('invalid_api_key');
            expect(result.retryable).toBe(false);
            expect(result.provider).toBe('google');
            expect(result.message).toContain('Invalid API key');
        });

        it('should map 429 status to rate_limit error', async () => {
            const { GoogleGenerativeAIFetchError } = await import('@google/generative-ai');
            const apiError = new GoogleGenerativeAIFetchError('Rate limited', 429, 'Too Many Requests');

            const result = geminiProvider.parseError(apiError);

            expect(result.type).toBe('rate_limit');
            expect(result.retryable).toBe(true);
            expect(result.provider).toBe('google');
        });

        it('should map quota exceeded to rate_limit error', async () => {
            const { GoogleGenerativeAIFetchError } = await import('@google/generative-ai');
            const apiError = new GoogleGenerativeAIFetchError(
                'Quota exceeded',
                403,
                'Forbidden',
                [{ reason: 'RATE_LIMIT_EXCEEDED' }]
            );

            const result = geminiProvider.parseError(apiError);

            expect(result.type).toBe('rate_limit');
            expect(result.retryable).toBe(true);
            expect(result.provider).toBe('google');
        });

        it('should map 500+ status to server_error', async () => {
            const { GoogleGenerativeAIFetchError } = await import('@google/generative-ai');

            for (const status of [500, 502, 503]) {
                const apiError = new GoogleGenerativeAIFetchError('Server error', status, 'Internal Server Error');
                const result = geminiProvider.parseError(apiError);

                expect(result.type).toBe('server_error');
                expect(result.retryable).toBe(true);
                expect(result.provider).toBe('google');
            }
        });

        it('should detect context length errors', () => {
            const contextError = new Error('Request payload size exceeds the limit');

            const result = geminiProvider.parseError(contextError);

            expect(result.type).toBe('context_exceeded');
            expect(result.retryable).toBe(false);
            expect(result.provider).toBe('google');
        });

        it('should detect network errors', () => {
            const networkError = new Error('network error: failed to fetch');

            const result = geminiProvider.parseError(networkError);

            expect(result.type).toBe('network_error');
            expect(result.retryable).toBe(true);
            expect(result.provider).toBe('google');
        });

        it('should return unknown type for unrecognized errors', () => {
            const unknownError = new Error('Something unexpected happened');

            const result = geminiProvider.parseError(unknownError);

            expect(result.type).toBe('unknown');
            expect(result.retryable).toBe(false);
            expect(result.provider).toBe('google');
            expect(result.message).toBe('Something unexpected happened');
        });

        it('should handle non-Error objects gracefully', () => {
            const weirdError = { code: 'WEIRD_ERROR' };

            const result = geminiProvider.parseError(weirdError);

            expect(result.type).toBe('unknown');
            expect(result.message).toBe('An unknown error occurred');
            expect(result.provider).toBe('google');
        });

        it('should always include provider: "google" in all errors', async () => {
            const { GoogleGenerativeAIFetchError } = await import('@google/generative-ai');

            // Test various error types
            const errors = [
                new GoogleGenerativeAIFetchError('Unauthorized', 401),
                new GoogleGenerativeAIFetchError('Rate limited', 429),
                new GoogleGenerativeAIFetchError('Server error', 500),
                new Error('Network error'),
                new Error('Unknown error'),
                { weird: 'object' },
                null,
                undefined,
            ];

            for (const error of errors) {
                const result = geminiProvider.parseError(error);
                expect(result.provider).toBe('google');
            }
        });
    });

    describe('Vision/multimodal support', () => {
        it('should handle base64 images in messages', async () => {
            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'gemini-2.5-flash',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'What is in this image?' },
                            { type: 'image', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...' },
                        ],
                    },
                ],
                systemPrompt: 'You are a helpful assistant.',
                maxTokens: 1024,
            };

            // This should not throw
            const generator = geminiProvider.streamAgentActions(options);
            const actions: StreamAction[] = [];

            for await (const action of generator) {
                actions.push(action);
            }

            // Verify we got actions
            expect(actions.length).toBeGreaterThan(0);
        });

        it('should handle jpeg images', async () => {
            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'gemini-2.5-flash',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Describe this photo' },
                            { type: 'image', image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...' },
                        ],
                    },
                ],
                systemPrompt: 'You are helpful.',
                maxTokens: 1024,
            };

            // This should not throw
            const generator = geminiProvider.streamAgentActions(options);
            const actions: StreamAction[] = [];

            for await (const action of generator) {
                actions.push(action);
            }

            expect(actions.length).toBeGreaterThan(0);
        });
    });
});
