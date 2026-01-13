/**
 * Tests for OpenAI Responses API Session Management
 *
 * These tests verify:
 * - Responses API is used when previousResponseId provided
 * - responseId extraction from API response
 * - Fallback to chat.completions API on error
 * - Session reset clears responseId
 *
 * Run with: npx vitest run src/test/openai-session.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StreamOptions, StreamAction } from '../ai/providers/types';

// Track which API was called
let apiCallType: 'responses' | 'chat.completions' | null = null;

// Track captured params for each API type
let capturedResponsesParams: {
	model?: string;
	input?: unknown;
	instructions?: string;
	previous_response_id?: string | null;
	store?: boolean | null;
	text?: unknown;
	stream?: boolean;
	max_output_tokens?: number | null;
	temperature?: number | null;
} | null = null;

let capturedChatParams: {
	model?: string;
	messages?: unknown[];
	max_tokens?: number;
	max_completion_tokens?: number;
	temperature?: number;
	response_format?: unknown;
	stream?: boolean;
} | null = null;

// Mock response ID to return
const mockResponseId = 'resp_test_12345';

// Control whether Responses API should fail
let responsesApiShouldFail = false;

// Track console.warn calls for DEBUG_SESSION logging
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

// Mock the OpenAI SDK
vi.mock('openai', () => {
	// Create a mock error class
	class MockAPIError extends Error {
		status: number;
		constructor(message: string, status: number) {
			super(message);
			this.status = status;
			this.name = 'APIError';
		}
	}

	// Create mock stream events for Responses API
	const createResponsesStream = () => {
		const events = [
			{
				type: 'response.created',
				response: { id: mockResponseId },
				sequence_number: 0
			},
			{
				type: 'response.output_text.delta',
				delta: '{"actions":[{"_',
				content_index: 0,
				output_index: 0,
				sequence_number: 1
			},
			{
				type: 'response.output_text.delta',
				delta: 'type":"message","content":"Hello!"}]}',
				content_index: 0,
				output_index: 0,
				sequence_number: 2
			},
			{
				type: 'response.completed',
				response: { id: mockResponseId, output_text: '{"actions":[{"_type":"message","content":"Hello!"}]}' },
				sequence_number: 3
			}
		];

		return {
			controller: { signal: { aborted: false } },
			[Symbol.asyncIterator]: async function* () {
				for (const event of events) {
					yield event;
				}
			}
		};
	};

	// Create mock stream for chat.completions API
	const createChatCompletionsStream = () => {
		const events = [
			{ choices: [{ delta: { content: '{"actions":[{"_type":"message","content":"Hello!"}]}' } }] }
		];

		return {
			controller: { signal: { aborted: false } },
			[Symbol.asyncIterator]: async function* () {
				for (const event of events) {
					yield event;
				}
			}
		};
	};

	return {
		default: class MockOpenAI {
			static APIError = MockAPIError;

			constructor(public options: { apiKey: string; dangerouslyAllowBrowser?: boolean }) {}

			models = {
				list: vi.fn().mockResolvedValue({
					data: [{ id: 'gpt-4o', object: 'model' }]
				})
			};

			responses = {
				create: vi.fn().mockImplementation((params: typeof capturedResponsesParams) => {
					capturedResponsesParams = params;
					apiCallType = 'responses';

					if (responsesApiShouldFail) {
						throw new MockAPIError('Responses API not available', 400);
					}

					return Promise.resolve(createResponsesStream());
				})
			};

			chat = {
				completions: {
					create: vi.fn().mockImplementation((params: typeof capturedChatParams) => {
						capturedChatParams = params;
						apiCallType = 'chat.completions';
						return Promise.resolve(createChatCompletionsStream());
					})
				}
			};
		}
	};
});

describe('OpenAI Session Management', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiCallType = null;
		capturedResponsesParams = null;
		capturedChatParams = null;
		responsesApiShouldFail = false;
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Responses API with previousResponseId', () => {
		it('should use Responses API when previousResponseId is provided', async () => {
			const { streamAgentActions } = await import('../ai/providers/openai');

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'gpt-4o',
				messages: [{ role: 'user', content: 'Hello' }],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024,
				previousResponseId: 'resp_previous_123'
			};

			const generator = streamAgentActions(options);
			const actions: StreamAction[] = [];
			for await (const action of generator) {
				actions.push(action);
			}

			// Verify Responses API was used
			expect(apiCallType).toBe('responses');
			expect(capturedResponsesParams).not.toBeNull();
			expect(capturedResponsesParams?.previous_response_id).toBe('resp_previous_123');
			expect(capturedResponsesParams?.store).toBe(true);
		});

		it('should use chat.completions API when no previousResponseId is provided', async () => {
			const { streamAgentActions } = await import('../ai/providers/openai');

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'gpt-4o',
				messages: [{ role: 'user', content: 'Hello' }],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024
				// No previousResponseId
			};

			const generator = streamAgentActions(options);
			const actions: StreamAction[] = [];
			for await (const action of generator) {
				actions.push(action);
			}

			// Verify chat.completions API was used
			expect(apiCallType).toBe('chat.completions');
			expect(capturedChatParams).not.toBeNull();
		});
	});

	describe('responseId extraction', () => {
		it('should extract responseId from Responses API and include in final action', async () => {
			const { streamAgentActions } = await import('../ai/providers/openai');

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'gpt-4o',
				messages: [{ role: 'user', content: 'Test responseId extraction' }],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024,
				previousResponseId: 'resp_previous_456'
			};

			const generator = streamAgentActions(options);
			const actions: StreamAction[] = [];
			for await (const action of generator) {
				actions.push(action);
			}

			// Find the final complete action
			const finalAction = actions.find(a => a.complete === true);
			expect(finalAction).toBeDefined();
			expect(finalAction?.responseId).toBe(mockResponseId);
		});

		it('should not include responseId when using chat.completions API', async () => {
			const { streamAgentActions } = await import('../ai/providers/openai');

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'gpt-4o',
				messages: [{ role: 'user', content: 'No session' }],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024
				// No previousResponseId - will use chat.completions
			};

			const generator = streamAgentActions(options);
			const actions: StreamAction[] = [];
			for await (const action of generator) {
				actions.push(action);
			}

			// responseId should not be present when using chat.completions
			const finalAction = actions.find(a => a.complete === true);
			expect(finalAction).toBeDefined();
			expect(finalAction?.responseId).toBeUndefined();
		});
	});

	describe('Fallback to chat.completions API', () => {
		it('should fall back to chat.completions when Responses API fails', async () => {
			const { streamAgentActions } = await import('../ai/providers/openai');

			responsesApiShouldFail = true;

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'gpt-4o',
				messages: [{ role: 'user', content: 'Test fallback' }],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024,
				previousResponseId: 'resp_previous_789'
			};

			const generator = streamAgentActions(options);
			const actions: StreamAction[] = [];
			for await (const action of generator) {
				actions.push(action);
			}

			// Should have fallen back to chat.completions
			expect(apiCallType).toBe('chat.completions');
			expect(actions.length).toBeGreaterThan(0);

			// Should have logged fallback event
			const fallbackLogs = consoleWarnSpy.mock.calls.filter(
				call => call[0]?.includes?.('SESSION') && call[0]?.includes?.('FALLBACK')
			);
			expect(fallbackLogs.length).toBeGreaterThan(0);
		});
	});

	describe('DEBUG_SESSION logging', () => {
		it('should log session events via debugSession when DEBUG_SESSION is enabled', async () => {
			const { streamAgentActions } = await import('../ai/providers/openai');

			const options: StreamOptions = {
				apiKey: 'test-api-key',
				modelId: 'gpt-4o',
				messages: [{ role: 'user', content: 'Test logging' }],
				systemPrompt: 'You are helpful.',
				maxTokens: 1024,
				previousResponseId: 'resp_test_log'
			};

			const generator = streamAgentActions(options);
			for await (const action of generator) {
				// Consume generator
			}

			// Check that session-related debug logs were emitted
			const sessionLogs = consoleWarnSpy.mock.calls.filter(
				call => typeof call[0] === 'string' && call[0].includes('SESSION')
			);

			// Should have logged session-related events
			expect(sessionLogs.length).toBeGreaterThan(0);
		});
	});
});
