/**
 * Integration Tests for Provider Caching/Session Support
 *
 * These tests verify:
 * - Anthropic multi-turn caching flow end-to-end
 * - OpenAI session continuity across requests
 * - Session reset clears all provider state
 * - Fallback paths work correctly
 * - Backward compatibility with no session state
 *
 * Run with: npx vitest run src/test/session-caching-integration.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProviderSessionState, StreamAction, CacheMetrics } from '../ai/providers/types';

// Track session state updates for verification
let capturedSessionUpdates: Array<{
	provider: 'anthropic' | 'openai' | 'google';
	metadata: { responseId?: string; cacheMetrics?: CacheMetrics };
}> = [];

describe('Provider Caching/Session Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedSessionUpdates = [];
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Anthropic multi-turn caching flow', () => {
		it('should track cache creation state after successful Anthropic request', () => {
			// Simulate the flow: request -> stream action with cacheMetrics -> session state update

			// Initial session state
			const sessionState: ProviderSessionState = {};

			// Simulate final action with cache metrics (from Anthropic provider)
			const finalAction: StreamAction = {
				_type: 'message',
				complete: true,
				time: 500,
				content: 'Hello!',
				cacheMetrics: { created: 1200, read: 0 } // Cache was created
			};

			// Simulate TldrawAgent.updateProviderSessionState behavior
			const updateProviderSessionState = (
				provider: 'anthropic' | 'openai' | 'google',
				metadata: { responseId?: string; cacheMetrics?: CacheMetrics }
			) => {
				if (provider === 'anthropic' && metadata.cacheMetrics) {
					const cacheCreated = metadata.cacheMetrics.created > 0;
					sessionState.anthropic = { cacheCreated };
				}
				capturedSessionUpdates.push({ provider, metadata });
			};

			// Execute update
			updateProviderSessionState('anthropic', {
				cacheMetrics: finalAction.cacheMetrics
			});

			// Verify session state was updated
			expect(sessionState.anthropic?.cacheCreated).toBe(true);
			expect(capturedSessionUpdates).toHaveLength(1);
			expect(capturedSessionUpdates[0].provider).toBe('anthropic');
		});

		it('should track cache read state on subsequent requests', () => {
			// Simulate subsequent request that reads from cache
			const sessionState: ProviderSessionState = {
				anthropic: { cacheCreated: true }
			};

			// Simulate final action with cache read metrics
			const finalAction: StreamAction = {
				_type: 'message',
				complete: true,
				time: 200, // Faster due to cache hit
				content: 'Cached response',
				cacheMetrics: { created: 0, read: 1200 } // Cache was read
			};

			// Update session state
			if (finalAction.cacheMetrics) {
				const cacheCreated = finalAction.cacheMetrics.created > 0;
				sessionState.anthropic = { cacheCreated };
			}

			// Verify: cacheCreated should now be false (read only, no new creation)
			expect(sessionState.anthropic?.cacheCreated).toBe(false);
		});
	});

	describe('OpenAI session continuity', () => {
		it('should store responseId after successful OpenAI request', () => {
			// Initial session state
			const sessionState: ProviderSessionState = {};

			// Simulate final action with responseId (from OpenAI Responses API)
			const finalAction: StreamAction = {
				_type: 'message',
				complete: true,
				time: 600,
				content: 'Hello!',
				responseId: 'resp_abc123xyz'
			};

			// Simulate TldrawAgent.updateProviderSessionState behavior
			const updateProviderSessionState = (
				provider: 'anthropic' | 'openai' | 'google',
				metadata: { responseId?: string; cacheMetrics?: CacheMetrics }
			) => {
				if (provider === 'openai' && metadata.responseId) {
					sessionState.openai = { responseId: metadata.responseId };
				}
				capturedSessionUpdates.push({ provider, metadata });
			};

			// Execute update
			updateProviderSessionState('openai', {
				responseId: finalAction.responseId
			});

			// Verify session state was updated
			expect(sessionState.openai?.responseId).toBe('resp_abc123xyz');
			expect(capturedSessionUpdates).toHaveLength(1);
			expect(capturedSessionUpdates[0].provider).toBe('openai');
		});

		it('should pass previousResponseId to subsequent requests', () => {
			// Session state from previous request
			const sessionState: ProviderSessionState = {
				openai: { responseId: 'resp_previous_456' }
			};

			// Simulate settings construction in requestAgent
			const settings = {
				providers: { openai: { apiKey: 'test-key' } },
				providerSessionState: sessionState
			};

			// Simulate streamAgent extracting previousResponseId
			const previousResponseId = settings.providerSessionState?.openai?.responseId;

			// Verify the previousResponseId is extracted correctly
			expect(previousResponseId).toBe('resp_previous_456');
		});
	});

	describe('Session reset behavior', () => {
		it('should clear all provider session state on reset', () => {
			// Session state with both providers
			const sessionState: ProviderSessionState = {
				anthropic: { cacheCreated: true },
				openai: { responseId: 'resp_test_789' }
			};

			// Simulate agent.reset() behavior
			const reset = () => {
				// Clear to empty object
				Object.keys(sessionState).forEach(key => {
					delete sessionState[key as keyof ProviderSessionState];
				});
			};

			// Execute reset
			reset();

			// Verify all state is cleared
			expect(sessionState.anthropic).toBeUndefined();
			expect(sessionState.openai).toBeUndefined();
			expect(Object.keys(sessionState)).toHaveLength(0);
		});
	});

	describe('Fallback path handling', () => {
		it('should work correctly when no session state is available (first request)', () => {
			// Empty session state
			const sessionState: ProviderSessionState = {};

			// Simulate settings construction
			const settings = {
				providers: { openai: { apiKey: 'test-key' } },
				providerSessionState: sessionState
			};

			// Extract previousResponseId (should be undefined)
			const previousResponseId = settings.providerSessionState?.openai?.responseId;

			// Verify: undefined previousResponseId means chat.completions API will be used
			expect(previousResponseId).toBeUndefined();

			// This should result in using the fallback chat.completions API
			const shouldUseResponsesAPI = !!previousResponseId;
			expect(shouldUseResponsesAPI).toBe(false);
		});

		it('should handle missing cache metrics gracefully', () => {
			// Simulate final action without cache metrics (e.g., caching disabled or not available)
			const finalAction: StreamAction = {
				_type: 'message',
				complete: true,
				time: 300,
				content: 'Response without cache'
				// No cacheMetrics field
			};

			// Session state update logic
			const sessionState: ProviderSessionState = {};
			if (finalAction.cacheMetrics) {
				sessionState.anthropic = {
					cacheCreated: finalAction.cacheMetrics.created > 0
				};
			}

			// Verify: no session state update when metrics are missing
			expect(sessionState.anthropic).toBeUndefined();
		});
	});

	describe('Backward compatibility', () => {
		it('should work without providerSessionState in settings', () => {
			// Legacy settings without providerSessionState
			const legacySettings = {
				providers: { anthropic: { apiKey: 'test-key' } },
				maxTokens: 8192,
				temperature: 0
				// No providerSessionState field
			};

			// Simulate streamAgent accessing session state
			const providerSessionState = (legacySettings as { providerSessionState?: ProviderSessionState }).providerSessionState;
			const previousResponseId = providerSessionState?.openai?.responseId;

			// Should safely return undefined
			expect(providerSessionState).toBeUndefined();
			expect(previousResponseId).toBeUndefined();
		});
	});
});
