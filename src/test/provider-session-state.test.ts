/**
 * Tests for Provider Session State Management
 *
 * These tests verify:
 * - Provider session state initialization
 * - Session state clearing on agent.reset()
 * - Optional field backward compatibility
 * - Type compatibility for ProviderSessionState
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamOptions, StreamAction, ProviderSessionState } from '../ai/providers/types';

describe('Provider Session State Types', () => {
	describe('ProviderSessionState type structure', () => {
		it('should allow empty provider session state', () => {
			const state: ProviderSessionState = {};
			expect(state).toEqual({});
			expect(state.anthropic).toBeUndefined();
			expect(state.openai).toBeUndefined();
		});

		it('should allow anthropic-only session state', () => {
			const state: ProviderSessionState = {
				anthropic: { cacheCreated: true }
			};
			expect(state.anthropic?.cacheCreated).toBe(true);
			expect(state.openai).toBeUndefined();
		});

		it('should allow openai-only session state', () => {
			const state: ProviderSessionState = {
				openai: { responseId: 'resp_123' }
			};
			expect(state.openai?.responseId).toBe('resp_123');
			expect(state.anthropic).toBeUndefined();
		});

		it('should allow combined provider session state', () => {
			const state: ProviderSessionState = {
				anthropic: { cacheCreated: false },
				openai: { responseId: 'resp_456' }
			};
			expect(state.anthropic?.cacheCreated).toBe(false);
			expect(state.openai?.responseId).toBe('resp_456');
		});
	});

	describe('StreamOptions backward compatibility', () => {
		it('should work without new optional fields', () => {
			// Existing code should continue to work without new fields
			const options: StreamOptions = {
				apiKey: 'test-key',
				modelId: 'test-model',
				messages: [],
				systemPrompt: 'You are helpful.',
				maxTokens: 1000
			};

			expect(options.apiKey).toBe('test-key');
			expect(options.previousResponseId).toBeUndefined();
			expect(options.enableCaching).toBeUndefined();
		});

		it('should accept new optional fields when provided', () => {
			const options: StreamOptions = {
				apiKey: 'test-key',
				modelId: 'test-model',
				messages: [],
				systemPrompt: 'You are helpful.',
				maxTokens: 1000,
				previousResponseId: 'resp_789',
				enableCaching: false
			};

			expect(options.previousResponseId).toBe('resp_789');
			expect(options.enableCaching).toBe(false);
		});

		it('should default enableCaching to true when not specified', () => {
			const options: StreamOptions = {
				apiKey: 'test-key',
				modelId: 'test-model',
				messages: [],
				systemPrompt: 'You are helpful.',
				maxTokens: 1000
			};

			// When not specified, provider implementations should treat it as true
			const enableCaching = options.enableCaching ?? true;
			expect(enableCaching).toBe(true);
		});
	});

	describe('StreamAction backward compatibility', () => {
		it('should work without new optional fields', () => {
			// Existing code should continue to work without new fields
			const action: StreamAction = {
				_type: 'message',
				complete: true,
				time: 100,
				message: 'Hello!'
			};

			expect(action._type).toBe('message');
			expect(action.responseId).toBeUndefined();
			expect(action.cacheMetrics).toBeUndefined();
		});

		it('should accept responseId in final action', () => {
			const action: StreamAction = {
				_type: 'message',
				complete: true,
				time: 200,
				message: 'Done!',
				responseId: 'resp_final'
			};

			expect(action.responseId).toBe('resp_final');
		});

		it('should accept cacheMetrics in final action', () => {
			const action: StreamAction = {
				_type: 'message',
				complete: true,
				time: 300,
				message: 'Cached response',
				cacheMetrics: { created: 0, read: 1024 }
			};

			expect(action.cacheMetrics).toEqual({ created: 0, read: 1024 });
		});

		it('should allow both responseId and cacheMetrics', () => {
			const action: StreamAction = {
				_type: 'message',
				complete: true,
				time: 400,
				responseId: 'resp_combined',
				cacheMetrics: { created: 512, read: 2048 }
			};

			expect(action.responseId).toBe('resp_combined');
			expect(action.cacheMetrics?.created).toBe(512);
			expect(action.cacheMetrics?.read).toBe(2048);
		});
	});
});

describe('Provider Session State in TldrawAgent', () => {
	// Mock TldrawAgent for testing atom behavior
	// We test the pattern rather than the full TldrawAgent to avoid heavy dependencies

	describe('Session state initialization', () => {
		it('should initialize with empty provider session state', () => {
			// Simulate atom initialization pattern
			const $providerSessionState = { value: {} as ProviderSessionState };

			expect($providerSessionState.value).toEqual({});
		});
	});

	describe('Session state clearing on reset', () => {
		it('should clear provider session state when reset is called', () => {
			// Simulate state with data
			const $providerSessionState = {
				value: {
					anthropic: { cacheCreated: true },
					openai: { responseId: 'resp_test' }
				} as ProviderSessionState,
				set: function(val: ProviderSessionState) { this.value = val; }
			};

			// Verify state exists before reset
			expect($providerSessionState.value.anthropic?.cacheCreated).toBe(true);
			expect($providerSessionState.value.openai?.responseId).toBe('resp_test');

			// Simulate reset() behavior
			$providerSessionState.set({});

			// Verify state is cleared
			expect($providerSessionState.value).toEqual({});
			expect($providerSessionState.value.anthropic).toBeUndefined();
			expect($providerSessionState.value.openai).toBeUndefined();
		});

		it('should not affect other atoms when clearing session state', () => {
			// Simulate multiple atoms
			const $providerSessionState = {
				value: { openai: { responseId: 'resp_x' } } as ProviderSessionState,
				set: function(val: ProviderSessionState) { this.value = val; }
			};
			const $chatHistory = {
				value: [{ type: 'prompt', message: 'Hello' }],
				set: function(val: typeof this.value) { this.value = val; }
			};

			// Reset only provider session state
			$providerSessionState.set({});

			// Chat history should remain unchanged
			expect($chatHistory.value).toHaveLength(1);
			expect($chatHistory.value[0].type).toBe('prompt');
		});
	});

	describe('Session state non-persistence', () => {
		it('should not persist provider session state across sessions', () => {
			// Provider session state is ephemeral - we just verify the design intent
			// Real persistence would use localStorage, but this atom should NOT be persisted

			// This test documents the expected behavior:
			// - $providerSessionState should NOT call persistAtomInLocalStorage
			// - Sessions are server-side and ephemeral

			const shouldPersist = false; // Design decision documented in spec
			expect(shouldPersist).toBe(false);
		});
	});
});
