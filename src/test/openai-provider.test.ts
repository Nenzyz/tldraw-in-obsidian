/**
 * Tests for the OpenAI provider implementation.
 * Run with: npx vitest run src/test/openai-provider.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openaiProvider } from '../ai/providers/openai';
import type { StreamOptions, StreamAction } from '../ai/providers/types';

// Track the last API call arguments for verification
let lastCreateCallArgs: unknown = null;

// Mock the OpenAI SDK
vi.mock('openai', () => {
    // Create a mock error class that mimics OpenAI.APIError
    class MockAPIError extends Error {
        status: number;
        constructor(message: string, status: number) {
            super(message);
            this.status = status;
            this.name = 'APIError';
        }
    }

    // Create mock stream chunks for testing
    const createMockStream = (chunks: Array<{ choices: Array<{ delta: { content?: string } }> }>) => {
        return {
            [Symbol.asyncIterator]: async function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            },
        };
    };

    return {
        default: class MockOpenAI {
            static APIError = MockAPIError;

            constructor(public options: { apiKey: string; dangerouslyAllowBrowser?: boolean }) {}

            models = {
                list: vi.fn().mockResolvedValue({
                    [Symbol.asyncIterator]: async function* () {
                        yield { id: 'gpt-4o-2024-11-20', object: 'model' };
                        yield { id: 'gpt-4-turbo-2024-04-09', object: 'model' };
                        yield { id: 'gpt-4.1-2025-04-14', object: 'model' };
                        yield { id: 'text-embedding-ada-002', object: 'model' }; // Should be filtered out
                        yield { id: 'dall-e-3', object: 'model' }; // Should be filtered out
                    },
                }),
            };

            chat = {
                completions: {
                    create: vi.fn().mockImplementation((args: unknown) => {
                        // Capture args for verification
                        lastCreateCallArgs = args;
                        return Promise.resolve(
                            createMockStream([
                                { choices: [{ delta: { content: '{"actions": [{"_type": "' } }] },
                                { choices: [{ delta: { content: 'message","content":"Hel' } }] },
                                { choices: [{ delta: { content: 'lo!"}]}' } }] },
                            ])
                        );
                    }),
                },
            };
        },
    };
});

describe('OpenAI Provider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lastCreateCallArgs = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Provider interface compliance', () => {
        it('should have name property set to "openai"', () => {
            expect(openaiProvider.name).toBe('openai');
        });

        it('should implement all AIProvider methods', () => {
            expect(typeof openaiProvider.createClient).toBe('function');
            expect(typeof openaiProvider.streamAgentActions).toBe('function');
            expect(typeof openaiProvider.testConnection).toBe('function');
            expect(typeof openaiProvider.parseError).toBe('function');
        });
    });

    describe('createClient', () => {
        it('should create an OpenAI client with dangerouslyAllowBrowser enabled', () => {
            const client = openaiProvider.createClient('test-api-key') as { options: { apiKey: string; dangerouslyAllowBrowser?: boolean } };

            expect(client).toBeDefined();
            expect(client.options.apiKey).toBe('test-api-key');
            expect(client.options.dangerouslyAllowBrowser).toBe(true);
        });
    });

    describe('streamAgentActions', () => {
        it('should return an async generator yielding StreamAction objects', async () => {
            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'gpt-4o',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are a helpful assistant.',
                maxTokens: 1024,
            };

            const generator = openaiProvider.streamAgentActions(options);

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

        it('should transform delta streaming to match expected output format', async () => {
            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'gpt-4o',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are helpful.',
                maxTokens: 1024,
            };

            const generator = openaiProvider.streamAgentActions(options);
            const actions: StreamAction[] = [];
            for await (const action of generator) {
                actions.push(action);
            }

            // The mock produces a message action
            expect(actions.length).toBeGreaterThan(0);

            // Find the complete action
            const completeAction = actions.find(a => a.complete);
            expect(completeAction).toBeDefined();
            expect(completeAction?._type).toBe('message');
            expect(completeAction?.content).toBe('Hello!');
        });

        it('should use response_format for JSON object mode and temperature 0', async () => {
            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'gpt-4o',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are helpful.',
                maxTokens: 1024,
            };

            // Consume the generator to trigger the API call
            const generator = openaiProvider.streamAgentActions(options);
            for await (const _ of generator) {
                // consume
            }

            // Verify response_format was passed via captured args
            expect(lastCreateCallArgs).not.toBeNull();
            const callArgs = lastCreateCallArgs as Record<string, unknown>;
            expect(callArgs.response_format).toEqual({ type: 'json_object' });
            expect(callArgs.temperature).toBe(0);
            expect(callArgs.stream).toBe(true);
        });
    });

    describe('testConnection', () => {
        it('should return success with models on valid API key', async () => {
            const result = await openaiProvider.testConnection('valid-api-key');

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.models).toBeDefined();
            expect(Array.isArray(result.models)).toBe(true);
        });

        it('should filter to only GPT models', async () => {
            const result = await openaiProvider.testConnection('valid-api-key');

            expect(result.success).toBe(true);
            expect(result.models).toBeDefined();

            // All models should be GPT models
            for (const model of result.models!) {
                expect(model.id).toMatch(/^gpt-/);
            }

            // Should not include non-GPT models
            const modelIds = result.models!.map(m => m.id);
            expect(modelIds).not.toContain('text-embedding-ada-002');
            expect(modelIds).not.toContain('dall-e-3');
        });

        it('should return error for empty API key', async () => {
            const result = await openaiProvider.testConnection('');

            expect(result.success).toBe(false);
            expect(result.error).toBe('API key is required');
            expect(result.models).toBeUndefined();
        });

        it('should return error for whitespace-only API key', async () => {
            const result = await openaiProvider.testConnection('   ');

            expect(result.success).toBe(false);
            expect(result.error).toBe('API key is required');
        });
    });

    describe('parseError', () => {
        it('should map 401 status to invalid_api_key error', async () => {
            const OpenAI = (await import('openai')).default;
            const apiError = new OpenAI.APIError('Unauthorized', 401);

            const result = openaiProvider.parseError(apiError);

            expect(result.type).toBe('invalid_api_key');
            expect(result.retryable).toBe(false);
            expect(result.provider).toBe('openai');
            expect(result.message).toContain('Invalid API key');
        });

        it('should map 429 status to rate_limit error', async () => {
            const OpenAI = (await import('openai')).default;
            const apiError = new OpenAI.APIError('Rate limited', 429);

            const result = openaiProvider.parseError(apiError);

            expect(result.type).toBe('rate_limit');
            expect(result.retryable).toBe(true);
            expect(result.provider).toBe('openai');
        });

        it('should map 500+ status to server_error', async () => {
            const OpenAI = (await import('openai')).default;

            for (const status of [500, 502, 503]) {
                const apiError = new OpenAI.APIError('Server error', status);
                const result = openaiProvider.parseError(apiError);

                expect(result.type).toBe('server_error');
                expect(result.retryable).toBe(true);
                expect(result.provider).toBe('openai');
            }
        });

        it('should detect context length errors', () => {
            const contextError = new Error('context_length_exceeded: maximum context length');

            const result = openaiProvider.parseError(contextError);

            expect(result.type).toBe('context_exceeded');
            expect(result.retryable).toBe(false);
            expect(result.provider).toBe('openai');
        });

        it('should always include provider: "openai" in all errors', async () => {
            const OpenAI = (await import('openai')).default;

            // Test various error types
            const errors = [
                new OpenAI.APIError('Unauthorized', 401),
                new OpenAI.APIError('Rate limited', 429),
                new OpenAI.APIError('Server error', 500),
                new Error('Network error'),
                new Error('Unknown error'),
                { weird: 'object' },
                null,
                undefined,
            ];

            for (const error of errors) {
                const result = openaiProvider.parseError(error);
                expect(result.provider).toBe('openai');
            }
        });
    });

    describe('vision/multimodal support', () => {
        it('should convert base64 images to OpenAI image_url format with detail auto', async () => {
            const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What is in this image?' },
                        { type: 'image', image: testImageBase64 },
                    ],
                }],
                systemPrompt: 'You are helpful.',
                maxTokens: 1024,
            };

            // Consume the generator to trigger the API call
            const generator = openaiProvider.streamAgentActions(options);
            for await (const _ of generator) {
                // consume
            }

            // Verify the API was called with image_url format via captured args
            expect(lastCreateCallArgs).not.toBeNull();
            const callArgs = lastCreateCallArgs as { messages: Array<{ role: string; content: unknown }> };

            // Find the user message with the image
            const userMessage = callArgs.messages?.find(
                (m) => m.role === 'user'
            );
            expect(userMessage).toBeDefined();
            expect(Array.isArray(userMessage?.content)).toBe(true);

            // Find the image part
            const content = userMessage?.content as Array<{ type: string; image_url?: { url: string; detail: string } }>;
            const imagePart = content.find(
                (p) => p.type === 'image_url'
            );
            expect(imagePart).toBeDefined();
            expect(imagePart?.image_url).toBeDefined();
            expect(imagePart?.image_url?.url).toBe(testImageBase64);
            expect(imagePart?.image_url?.detail).toBe('auto');
        });
    });
});
