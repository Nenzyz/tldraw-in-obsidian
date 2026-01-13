/**
 * Tests for the Anthropic provider implementation.
 * Run with: npx vitest run src/test/anthropic-provider.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { anthropicProvider } from '../ai/providers/anthropic';
import type { StreamOptions, StreamAction } from '../ai/providers/types';

// Track abort calls for testing cancellation
let lastStreamAbortFn: (() => void) | null = null;

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
    // Create a mock error class that mimics Anthropic.APIError
    class MockAPIError extends Error {
        status: number;
        constructor(message: string, status: number) {
            super(message);
            this.status = status;
            this.name = 'APIError';
        }
    }

    // Create mock stream events for testing
    const createMockStream = (events: Array<{ type: string; delta?: { type: string; text?: string } }>) => {
        const abortFn = vi.fn();
        lastStreamAbortFn = abortFn;
        return {
            abort: abortFn,
            [Symbol.asyncIterator]: async function* () {
                for (const event of events) {
                    yield event;
                }
            },
        };
    };

    return {
        default: class MockAnthropic {
            static APIError = MockAPIError;

            constructor(public options: { apiKey: string; dangerouslyAllowBrowser?: boolean }) {}

            models = {
                list: vi.fn().mockResolvedValue({
                    data: [
                        { id: 'claude-3-5-sonnet-20241022', type: 'model' },
                        { id: 'claude-3-opus-20240229', type: 'model' },
                        { id: 'gpt-4', type: 'model' }, // Should be filtered out
                    ],
                }),
            };

            messages = {
                // Use mockReturnValue (synchronous) instead of mockResolvedValue (Promise)
                // because client.messages.stream() returns the stream directly, not a Promise
                stream: vi.fn().mockReturnValue(
                    createMockStream([
                        { type: 'message_start' },
                        { type: 'content_block_start' },
                        { type: 'content_block_delta', delta: { type: 'text_delta', text: '"message","content":"Hel' } },
                        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo!"}]}' } },
                        { type: 'message_stop' },
                    ])
                ),
            };
        },
    };
});

describe('Anthropic Provider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lastStreamAbortFn = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Provider interface compliance', () => {
        it('should have name property set to "anthropic"', () => {
            expect(anthropicProvider.name).toBe('anthropic');
        });

        it('should implement all AIProvider methods', () => {
            expect(typeof anthropicProvider.createClient).toBe('function');
            expect(typeof anthropicProvider.streamAgentActions).toBe('function');
            expect(typeof anthropicProvider.testConnection).toBe('function');
            expect(typeof anthropicProvider.parseError).toBe('function');
        });
    });

    describe('createClient', () => {
        it('should create an Anthropic client with dangerouslyAllowBrowser enabled', () => {
            const client = anthropicProvider.createClient('test-api-key') as { options: { apiKey: string; dangerouslyAllowBrowser?: boolean } };

            expect(client).toBeDefined();
            expect(client.options.apiKey).toBe('test-api-key');
            expect(client.options.dangerouslyAllowBrowser).toBe(true);
        });
    });

    describe('streamAgentActions', () => {
        it('should return an async generator yielding StreamAction objects', async () => {
            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'claude-3-5-sonnet-20241022',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are a helpful assistant.',
                maxTokens: 1024,
            };

            const generator = anthropicProvider.streamAgentActions(options);

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

        it('should apply JSON prefill technique correctly', async () => {
            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'claude-3-5-sonnet-20241022',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are helpful.',
                maxTokens: 1024,
            };

            // Consume the generator to trigger the API call
            const generator = anthropicProvider.streamAgentActions(options);
            const actions: StreamAction[] = [];
            for await (const action of generator) {
                actions.push(action);
            }

            // The mock returns a message action - verify the prefill format is applied
            // The JSON prefill '{"actions": [{"_type":' ensures structured output
            expect(actions.length).toBeGreaterThan(0);

            // All actions should have _type field (due to prefill technique)
            for (const action of actions) {
                expect(action._type).toBeDefined();
            }
        });

        it('should handle cancellation via AbortSignal', async () => {
            const abortController = new AbortController();

            const options: StreamOptions = {
                apiKey: 'test-api-key',
                modelId: 'claude-3-5-sonnet-20241022',
                messages: [{ role: 'user', content: 'Hello' }],
                systemPrompt: 'You are helpful.',
                maxTokens: 1024,
                signal: abortController.signal,
            };

            const generator = anthropicProvider.streamAgentActions(options);

            // Start consuming the generator
            const iterator = generator[Symbol.asyncIterator]();

            // Get first value to ensure stream is started
            await iterator.next();

            // Now the stream should be created and we have access to abort
            expect(lastStreamAbortFn).toBeDefined();

            // Abort the request
            abortController.abort();

            // Verify the signal is aborted
            expect(abortController.signal.aborted).toBe(true);

            // The stream's abort method should be called when signal fires
            // Note: due to event loop timing, we may need to wait briefly
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(lastStreamAbortFn).toHaveBeenCalled();
        });
    });

    describe('testConnection', () => {
        it('should return success with models on valid API key', async () => {
            const result = await anthropicProvider.testConnection('valid-api-key');

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.models).toBeDefined();
            expect(Array.isArray(result.models)).toBe(true);
        });

        it('should filter to only Claude models', async () => {
            const result = await anthropicProvider.testConnection('valid-api-key');

            expect(result.success).toBe(true);
            expect(result.models).toBeDefined();

            // All models should be Claude models
            for (const model of result.models!) {
                expect(model.id).toMatch(/^claude/);
            }

            // Should not include non-Claude models
            const modelIds = result.models!.map(m => m.id);
            expect(modelIds).not.toContain('gpt-4');
        });

        it('should return error for empty API key', async () => {
            const result = await anthropicProvider.testConnection('');

            expect(result.success).toBe(false);
            expect(result.error).toBe('API key is required');
            expect(result.models).toBeUndefined();
        });

        it('should return error for whitespace-only API key', async () => {
            const result = await anthropicProvider.testConnection('   ');

            expect(result.success).toBe(false);
            expect(result.error).toBe('API key is required');
        });
    });

    describe('parseError', () => {
        it('should map 401 status to invalid_api_key error', async () => {
            const Anthropic = (await import('@anthropic-ai/sdk')).default;
            const apiError = new Anthropic.APIError('Unauthorized', 401);

            const result = anthropicProvider.parseError(apiError);

            expect(result.type).toBe('invalid_api_key');
            expect(result.retryable).toBe(false);
            expect(result.provider).toBe('anthropic');
            expect(result.message).toContain('Invalid API key');
        });

        it('should map 429 status to rate_limit error', async () => {
            const Anthropic = (await import('@anthropic-ai/sdk')).default;
            const apiError = new Anthropic.APIError('Rate limited', 429);

            const result = anthropicProvider.parseError(apiError);

            expect(result.type).toBe('rate_limit');
            expect(result.retryable).toBe(true);
            expect(result.provider).toBe('anthropic');
        });

        it('should map 500+ status to server_error', async () => {
            const Anthropic = (await import('@anthropic-ai/sdk')).default;

            for (const status of [500, 502, 503]) {
                const apiError = new Anthropic.APIError('Server error', status);
                const result = anthropicProvider.parseError(apiError);

                expect(result.type).toBe('server_error');
                expect(result.retryable).toBe(true);
                expect(result.provider).toBe('anthropic');
            }
        });

        it('should detect context length errors', () => {
            const contextError = new Error('context_length_exceeded: maximum context length');

            const result = anthropicProvider.parseError(contextError);

            expect(result.type).toBe('context_exceeded');
            expect(result.retryable).toBe(false);
            expect(result.provider).toBe('anthropic');
        });

        it('should detect network errors', () => {
            const networkError = new Error('network error: failed to fetch');

            const result = anthropicProvider.parseError(networkError);

            expect(result.type).toBe('network_error');
            expect(result.retryable).toBe(true);
            expect(result.provider).toBe('anthropic');
        });

        it('should return unknown type for unrecognized errors', () => {
            const unknownError = new Error('Something unexpected happened');

            const result = anthropicProvider.parseError(unknownError);

            expect(result.type).toBe('unknown');
            expect(result.retryable).toBe(false);
            expect(result.provider).toBe('anthropic');
            expect(result.message).toBe('Something unexpected happened');
        });

        it('should handle non-Error objects gracefully', () => {
            const weirdError = { code: 'WEIRD_ERROR' };

            const result = anthropicProvider.parseError(weirdError);

            expect(result.type).toBe('unknown');
            expect(result.message).toBe('An unknown error occurred');
            expect(result.provider).toBe('anthropic');
        });

        it('should always include provider: "anthropic" in all errors', async () => {
            const Anthropic = (await import('@anthropic-ai/sdk')).default;

            // Test various error types
            const errors = [
                new Anthropic.APIError('Unauthorized', 401),
                new Anthropic.APIError('Rate limited', 429),
                new Anthropic.APIError('Server error', 500),
                new Error('Network error'),
                new Error('Unknown error'),
                { weird: 'object' },
                null,
                undefined,
            ];

            for (const error of errors) {
                const result = anthropicProvider.parseError(error);
                expect(result.provider).toBe('anthropic');
            }
        });
    });
});
