/**
 * Integration tests for streamAgent with multi-provider support.
 *
 * These tests verify that:
 * - streamAgent routes to the correct provider based on model
 * - Output format is consistent across providers
 * - Provider-specific API key retrieval works correctly
 * - Error handling propagates correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getApiKeyForProvider } from '../ai/agent/streamAgent'
import { getAgentModelDefinition, getProviderForModel } from '../ai/models'
import { getProvider, clearProviderCache } from '../ai/providers'

describe('streamAgent Integration', () => {
	beforeEach(() => {
		clearProviderCache()
	})

	describe('getApiKeyForProvider', () => {
		it('returns API key from new multi-provider schema', () => {
			const settings = {
				providers: {
					anthropic: { apiKey: 'sk-ant-test' },
					google: { apiKey: 'AIza-test' },
					openai: { apiKey: 'sk-test' },
					'openai-compatible': { apiKey: '' },
				},
			}

			expect(getApiKeyForProvider(settings, 'anthropic')).toBe('sk-ant-test')
			expect(getApiKeyForProvider(settings, 'google')).toBe('AIza-test')
			expect(getApiKeyForProvider(settings, 'openai')).toBe('sk-test')
			expect(getApiKeyForProvider(settings, 'openai-compatible')).toBe('')
		})

		it('falls back to old schema for anthropic', () => {
			const settings = {
				apiKey: 'legacy-anthropic-key',
			}

			expect(getApiKeyForProvider(settings, 'anthropic')).toBe('legacy-anthropic-key')
			expect(getApiKeyForProvider(settings, 'google')).toBeUndefined()
			expect(getApiKeyForProvider(settings, 'openai')).toBeUndefined()
		})

		it('prefers new schema over old schema', () => {
			const settings = {
				apiKey: 'old-key',
				providers: {
					anthropic: { apiKey: 'new-key' },
				},
			}

			expect(getApiKeyForProvider(settings, 'anthropic')).toBe('new-key')
		})

		it('returns undefined for unconfigured providers', () => {
			const settings = {
				providers: {
					anthropic: { apiKey: '' },
					google: {},
				},
			}

			expect(getApiKeyForProvider(settings, 'anthropic')).toBe('')
			expect(getApiKeyForProvider(settings, 'openai')).toBeUndefined()
		})

		it('handles missing ai settings gracefully', () => {
			expect(getApiKeyForProvider({}, 'anthropic')).toBeUndefined()
			expect(getApiKeyForProvider({}, 'google')).toBeUndefined()
		})
	})

	describe('provider routing based on model', () => {
		it('routes claude models to anthropic provider', async () => {
			const models = ['claude-4.5-sonnet', 'claude-4-sonnet', 'claude-3.7-sonnet'] as const

			for (const modelName of models) {
				const definition = getAgentModelDefinition(modelName)
				expect(definition.provider).toBe('anthropic')

				const provider = await getProvider(definition.provider)
				expect(provider.name).toBe('anthropic')
			}
		})

		it('routes gemini models to google provider', async () => {
			const models = ['gemini-2.5-flash', 'gemini-2.5-pro'] as const

			for (const modelName of models) {
				const definition = getAgentModelDefinition(modelName)
				expect(definition.provider).toBe('google')

				const provider = await getProvider(definition.provider)
				expect(provider.name).toBe('google')
			}
		})

		it('routes gpt models to openai provider', async () => {
			const models = ['gpt-4o', 'gpt-4.1', 'gpt-5'] as const

			for (const modelName of models) {
				const definition = getAgentModelDefinition(modelName)
				expect(definition.provider).toBe('openai')

				const provider = await getProvider(definition.provider)
				expect(provider.name).toBe('openai')
			}
		})
	})

	describe('getProviderForModel helper', () => {
		it('returns correct provider for each model', () => {
			expect(getProviderForModel('claude-4.5-sonnet')).toBe('anthropic')
			expect(getProviderForModel('claude-4-sonnet')).toBe('anthropic')
			expect(getProviderForModel('gemini-2.5-flash')).toBe('google')
			expect(getProviderForModel('gemini-2.5-pro')).toBe('google')
			expect(getProviderForModel('gpt-4o')).toBe('openai')
			expect(getProviderForModel('gpt-4.1')).toBe('openai')
			expect(getProviderForModel('gpt-5')).toBe('openai')
		})

		it('throws for unknown models', () => {
			expect(() => getProviderForModel('unknown-model')).toThrow()
		})
	})

		describe('provider interface consistency', () => {
			it('all providers implement streamAgentActions as async generator', async () => {
				const providers = ['anthropic', 'google', 'openai', 'openai-compatible'] as const

			for (const providerName of providers) {
				const provider = await getProvider(providerName)

				// streamAgentActions should be a function that returns an async generator
				expect(typeof provider.streamAgentActions).toBe('function')

				// Call it with minimal options (will fail with no API key, but we're testing the interface)
				const generator = provider.streamAgentActions({
					apiKey: '',
					modelId: 'test',
					messages: [],
					systemPrompt: '',
					maxTokens: 100,
				})

				// Should be an async generator
				expect(typeof generator[Symbol.asyncIterator]).toBe('function')
			}
		})

			it('all providers implement testConnection', async () => {
				const providers = ['anthropic', 'google', 'openai', 'openai-compatible'] as const

			for (const providerName of providers) {
				const provider = await getProvider(providerName)
				expect(typeof provider.testConnection).toBe('function')
			}
		})

			it('all providers implement parseError', async () => {
				const providers = ['anthropic', 'google', 'openai', 'openai-compatible'] as const

			for (const providerName of providers) {
				const provider = await getProvider(providerName)
				expect(typeof provider.parseError).toBe('function')

				// Parse a generic error
				const error = provider.parseError(new Error('test error'))
				expect(error).toHaveProperty('type')
				expect(error).toHaveProperty('message')
				expect(error).toHaveProperty('retryable')
				expect(error).toHaveProperty('provider')
				expect(error.provider).toBe(providerName)
			}
		})
	})

		describe('error handling', () => {
			it('parseError returns correct provider for each provider', async () => {
				const providers = ['anthropic', 'google', 'openai', 'openai-compatible'] as const

			for (const providerName of providers) {
				const provider = await getProvider(providerName)
				const error = provider.parseError(new Error('test'))
				expect(error.provider).toBe(providerName)
			}
		})

			it('unknown errors are marked as not retryable', async () => {
				const providers = ['anthropic', 'google', 'openai', 'openai-compatible'] as const

			for (const providerName of providers) {
				const provider = await getProvider(providerName)
				const error = provider.parseError(new Error('random error'))
				expect(error.type).toBe('unknown')
				expect(error.retryable).toBe(false)
			}
		})
	})
})
