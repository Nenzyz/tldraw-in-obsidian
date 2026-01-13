/**
 * Tests for Anthropic Prompt Caching Implementation
 *
 * These tests verify:
 * - System prompt is sent as content block array with cache_control
 * - Cache metrics extraction from response usage
 * - Graceful fallback when caching fails
 * - DEBUG_CACHE logging toggle
 *
 * Run with: npx vitest run src/test/anthropic-caching.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StreamOptions, StreamAction } from '../ai/providers/types';

// Variables to capture what was sent to the API
let capturedStreamParams: {
	system?: unknown;
	messages?: unknown[];
	model?: string;
} | null = null;

// Track cache metrics events
let mockMessageStartUsage: {
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	input_tokens?: number;
	output_tokens?: number;
} | null = null;

// Track console.warn calls for DEBUG_CACHE logging
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

// Track if we should simulate a caching API error
let simulateCacheError = false;
let cacheErrorAttempt = 0;

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
	const createMockStream = () => {
		const events: Array<{ type: string; delta?: { type: string; text?: string }; message?: { usage?: typeof mockMessageStartUsage } }> = [
			{
				type: 'message_start',
				message: {
					usage: mockMessageStartUsage || {
						input_tokens: 1500,
						output_tokens: 0,
						cache_creation_input_tokens: 1000,
						cache_read_input_tokens: 500
					}
				}
			},
			{ type: 'content_block_start' },
			{ type: 'content_block_delta', delta: { type: 'text_delta', text: '"message","content":"Hel' } },
			{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo!"}]}' } },
			{ type: 'message_stop' },
		];

		return {
			abort: vi.fn(),
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
					],
				}),
			};

			messages = {
				stream: vi.fn().mockImplementation((params: typeof capturedStreamParams) => {
					capturedStreamParams = params;

					// Simulate error on first attempt if caching causes issues
					if (simulateCacheError && cacheErrorAttempt === 0) {
						cacheErrorAttempt++;

						// Check if cache_control is present in system prompt
						const hasCache = Array.isArray(params?.system) &&
							params.system.some((block: { cache_control?: unknown }) => block.cache_control);

						if (hasCache) {
							throw new MockAPIError('Invalid parameter: cache_control', 400);
						}
					}

					return createMockStream();
				}),
			};
		},
	};
});

describe('Anthropic Prompt Caching', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedStreamParams = null;
		mockMessageStartUsage = null;
		simulateCacheError = false;
		cacheErrorAttempt = 0;
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('System prompt cache_control', () => {
		it('should send system prompt as content block array with cache_control when caching enabled', async () => {
			// Dynamic import to get the actual implementation with mocked SDK
			const { streamAgentActions } = await import('../ai/providers/anthropic');

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'claude-3-5-sonnet-20241022',
				messages: [{ role: 'user', content: 'Hello' }],
				systemPrompt: 'You are a helpful assistant that helps with tldraw.',
				maxTokens: 1024,
				enableCaching: true, // Explicitly enable
			};

			const generator = streamAgentActions(options);
			const actions: StreamAction[] = [];
			for await (const action of generator) {
				actions.push(action);
			}

			// Verify system prompt is an array with cache_control
			expect(capturedStreamParams).not.toBeNull();
			expect(Array.isArray(capturedStreamParams?.system)).toBe(true);

			const systemBlocks = capturedStreamParams?.system as Array<{
				type: string;
				text: string;
				cache_control?: { type: string };
			}>;
			expect(systemBlocks.length).toBeGreaterThan(0);
			expect(systemBlocks[0].type).toBe('text');
			expect(systemBlocks[0].text).toBe('You are a helpful assistant that helps with tldraw.');
			expect(systemBlocks[0].cache_control).toEqual({ type: 'ephemeral' });
		});

		it('should send system prompt as plain string when caching disabled', async () => {
			const { streamAgentActions } = await import('../ai/providers/anthropic');

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'claude-3-5-sonnet-20241022',
				messages: [{ role: 'user', content: 'Hello' }],
				systemPrompt: 'You are a helpful assistant.',
				maxTokens: 1024,
				enableCaching: false, // Explicitly disable
			};

			const generator = streamAgentActions(options);
			for await (const action of generator) {
				// Consume generator
			}

			// When caching is disabled, system should be a plain string
			expect(capturedStreamParams).not.toBeNull();
			expect(typeof capturedStreamParams?.system).toBe('string');
			expect(capturedStreamParams?.system).toBe('You are a helpful assistant.');
		});
	});

	describe('Cache metrics extraction', () => {
		it('should extract cache metrics from message_start event and include in final action', async () => {
			const { streamAgentActions } = await import('../ai/providers/anthropic');

			mockMessageStartUsage = {
				input_tokens: 2000,
				output_tokens: 100,
				cache_creation_input_tokens: 1200,
				cache_read_input_tokens: 800
			};

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'claude-3-5-sonnet-20241022',
				messages: [{ role: 'user', content: 'Test cache metrics' }],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024,
				enableCaching: true,
			};

			const generator = streamAgentActions(options);
			const actions: StreamAction[] = [];
			for await (const action of generator) {
				actions.push(action);
			}

			// Find the final complete action
			const finalAction = actions.find(a => a.complete === true);
			expect(finalAction).toBeDefined();
			expect(finalAction?.cacheMetrics).toBeDefined();
			expect(finalAction?.cacheMetrics?.created).toBe(1200);
			expect(finalAction?.cacheMetrics?.read).toBe(800);
		});

		it('should not include cacheMetrics when usage metrics are not available', async () => {
			const { streamAgentActions } = await import('../ai/providers/anthropic');

			mockMessageStartUsage = {
				input_tokens: 1000,
				output_tokens: 50
				// No cache metrics
			};

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'claude-3-5-sonnet-20241022',
				messages: [{ role: 'user', content: 'No cache' }],
				systemPrompt: 'Test',
				maxTokens: 1024,
				enableCaching: true,
			};

			const generator = streamAgentActions(options);
			const actions: StreamAction[] = [];
			for await (const action of generator) {
				actions.push(action);
			}

			const finalAction = actions.find(a => a.complete === true);
			expect(finalAction).toBeDefined();
			// cacheMetrics should be undefined when no cache metrics in response
			expect(finalAction?.cacheMetrics).toBeUndefined();
		});
	});

	describe('Graceful fallback on caching errors', () => {
		it('should retry without cache_control when caching causes API error', async () => {
			const { streamAgentActions } = await import('../ai/providers/anthropic');

			simulateCacheError = true; // Enable error simulation

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'claude-3-5-sonnet-20241022',
				messages: [{ role: 'user', content: 'Test fallback' }],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024,
				enableCaching: true,
			};

			const generator = streamAgentActions(options);
			const actions: StreamAction[] = [];
			for await (const action of generator) {
				actions.push(action);
			}

			// Should have recovered and produced actions
			expect(actions.length).toBeGreaterThan(0);

			// Should have logged fallback event
			const fallbackLogs = consoleWarnSpy.mock.calls.filter(
				call => call[0]?.includes?.('CACHE') && call[0]?.includes?.('FALLBACK')
			);
			expect(fallbackLogs.length).toBeGreaterThan(0);
		});
	});

	describe('DEBUG_CACHE logging', () => {
		it('should log cache metrics via debugCache when DEBUG_CACHE is enabled', async () => {
			const { streamAgentActions } = await import('../ai/providers/anthropic');

			mockMessageStartUsage = {
				input_tokens: 3000,
				cache_creation_input_tokens: 2000,
				cache_read_input_tokens: 1000
			};

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'claude-3-5-sonnet-20241022',
				messages: [{ role: 'user', content: 'Test logging' }],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024,
				enableCaching: true,
			};

			const generator = streamAgentActions(options);
			for await (const action of generator) {
				// Consume generator
			}

			// Check that cache-related debug logs were emitted
			const cacheLogs = consoleWarnSpy.mock.calls.filter(
				call => typeof call[0] === 'string' && call[0].includes('CACHE')
			);

			// Should have logged cache metrics (created, read, hit ratio)
			expect(cacheLogs.length).toBeGreaterThan(0);
		});
	});

	describe('Multi-turn cache breakpoints', () => {
		it('should add cache_control to early user messages for multi-turn benefit', async () => {
			const { streamAgentActions } = await import('../ai/providers/anthropic');

			// Use messages with content length >= 100 characters (MIN_CACHE_CONTENT_LENGTH)
			const longMessage1 = 'This is the first user message with substantial content that exceeds the minimum cache threshold of 100 characters for proper caching benefit in multi-turn conversations.';
			const longMessage2 = 'This is the second user message that also contains enough text to qualify for caching. We need at least 100 characters to trigger the cache breakpoint addition.';
			const shortMessage = 'Short third message'; // This should NOT get cache_control

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'claude-3-5-sonnet-20241022',
				messages: [
					{ role: 'user', content: longMessage1 },
					{ role: 'assistant', content: 'First response from assistant' },
					{ role: 'user', content: longMessage2 },
					{ role: 'assistant', content: 'Second response from assistant' },
					{ role: 'user', content: shortMessage },
				],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024,
				enableCaching: true,
			};

			const generator = streamAgentActions(options);
			for await (const action of generator) {
				// Consume generator
			}

			expect(capturedStreamParams).not.toBeNull();
			const messages = capturedStreamParams?.messages as Array<{
				role: string;
				content: string | Array<{ type: string; text: string; cache_control?: { type: string } }>;
			}>;

			// Find user messages that have cache_control
			const userMessagesWithCache = messages.filter(msg => {
				if (msg.role !== 'user') return false;
				if (typeof msg.content === 'string') return false;
				return msg.content.some(block => block.cache_control);
			});

			// Should have cache_control on first 2 user messages (longMessage1, longMessage2)
			// The third user message (shortMessage) is too short and should NOT have cache_control
			expect(userMessagesWithCache.length).toBe(2);

			// Verify the short message did NOT get cache_control (should still be a string)
			const lastUserMessage = messages.filter(m => m.role === 'user').pop();
			expect(typeof lastUserMessage?.content).toBe('string');
			expect(lastUserMessage?.content).toBe(shortMessage);
		});
	});
});
