/**
 * Tests for the AI provider abstraction layer.
 * Run with: npx vitest run src/test/provider-abstraction.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getProvider,
    clearProviderCache,
    isProviderSupported,
    anthropicProvider,
    geminiProvider,
    openaiProvider,
    openaiCompatibleProvider,
} from '../ai/providers';
import type { AIProvider, AIError, AIErrorType } from '../ai/providers';
import type { AgentModelProvider } from '../ai/models';

describe('Provider Abstraction Layer', () => {
    beforeEach(() => {
        // Clear cache between tests
        clearProviderCache();
    });

    describe('AIProvider interface contract', () => {
        it('should enforce AIProvider interface on Anthropic provider', () => {
            // Verify all required properties and methods exist
            const provider: AIProvider = anthropicProvider;

            expect(provider.name).toBe('anthropic');
            expect(typeof provider.createClient).toBe('function');
            expect(typeof provider.streamAgentActions).toBe('function');
            expect(typeof provider.testConnection).toBe('function');
            expect(typeof provider.parseError).toBe('function');
        });

        it('should enforce AIProvider interface on Gemini provider', () => {
            const provider: AIProvider = geminiProvider;

            expect(provider.name).toBe('google');
            expect(typeof provider.createClient).toBe('function');
            expect(typeof provider.streamAgentActions).toBe('function');
            expect(typeof provider.testConnection).toBe('function');
            expect(typeof provider.parseError).toBe('function');
        });

        it('should enforce AIProvider interface on OpenAI provider', () => {
            const provider: AIProvider = openaiProvider;

            expect(provider.name).toBe('openai');
            expect(typeof provider.createClient).toBe('function');
            expect(typeof provider.streamAgentActions).toBe('function');
            expect(typeof provider.testConnection).toBe('function');
            expect(typeof provider.parseError).toBe('function');
        });

        it('should enforce AIProvider interface on OpenAI-compatible provider', () => {
            const provider: AIProvider = openaiCompatibleProvider;

            expect(provider.name).toBe('openai-compatible');
            expect(typeof provider.createClient).toBe('function');
            expect(typeof provider.streamAgentActions).toBe('function');
            expect(typeof provider.testConnection).toBe('function');
            expect(typeof provider.parseError).toBe('function');
        });
    });

    describe('Factory function', () => {
        it('should return correct provider type for anthropic', async () => {
            const provider = await getProvider('anthropic');

            expect(provider).toBe(anthropicProvider);
            expect(provider.name).toBe('anthropic');
        });

        it('should return correct provider type for google', async () => {
            const provider = await getProvider('google');

            expect(provider).toBe(geminiProvider);
            expect(provider.name).toBe('google');
        });

        it('should return correct provider type for openai', async () => {
            const provider = await getProvider('openai');

            expect(provider).toBe(openaiProvider);
            expect(provider.name).toBe('openai');
        });

        it('should return correct provider type for openai-compatible', async () => {
            const provider = await getProvider('openai-compatible');

            expect(provider).toBe(openaiCompatibleProvider);
            expect(provider.name).toBe('openai-compatible');
        });

        it('should cache provider instances', async () => {
            const provider1 = await getProvider('anthropic');
            const provider2 = await getProvider('anthropic');

            expect(provider1).toBe(provider2);
        });

        it('should throw descriptive error for unsupported provider', async () => {
            // TypeScript prevents this at compile time, but test runtime behavior
            const invalidProvider = 'unsupported' as AgentModelProvider;

            await expect(getProvider(invalidProvider)).rejects.toThrow(
                'Unsupported AI provider: unsupported'
            );
        });
    });

    describe('Error type normalization', () => {
        it('should normalize errors with correct AIError structure', () => {
            const testError = new Error('Test error message');
            const normalizedError = anthropicProvider.parseError(testError);

            // Verify AIError structure
            expect(normalizedError).toHaveProperty('type');
            expect(normalizedError).toHaveProperty('message');
            expect(normalizedError).toHaveProperty('retryable');
            expect(normalizedError).toHaveProperty('provider');

            // Verify types
            expect(typeof normalizedError.type).toBe('string');
            expect(typeof normalizedError.message).toBe('string');
            expect(typeof normalizedError.retryable).toBe('boolean');
            expect(normalizedError.provider).toBe('anthropic');
        });

        it('should handle non-Error objects gracefully', () => {
            const weirdError = { weird: 'object' };
            const normalizedError = anthropicProvider.parseError(weirdError);

            expect(normalizedError.type).toBe('unknown');
            expect(normalizedError.message).toBe('An unknown error occurred');
            expect(normalizedError.provider).toBe('anthropic');
        });

        it('should include provider name in normalized errors for each provider', () => {
            const testError = new Error('Test');

            const anthropicError = anthropicProvider.parseError(testError);
            const geminiError = geminiProvider.parseError(testError);
            const openaiError = openaiProvider.parseError(testError);
            const openaiCompatibleError = openaiCompatibleProvider.parseError(testError);

            expect(anthropicError.provider).toBe('anthropic');
            expect(geminiError.provider).toBe('google');
            expect(openaiError.provider).toBe('openai');
            expect(openaiCompatibleError.provider).toBe('openai-compatible');
        });

        it('should cover all expected AIErrorType values', () => {
            // This test ensures our type definition is complete
            const validErrorTypes: AIErrorType[] = [
                'invalid_api_key',
                'rate_limit',
                'network_error',
                'server_error',
                'context_exceeded',
                'unknown',
            ];

            // Type check - if this compiles, our types are correct
            validErrorTypes.forEach((errorType) => {
                const error: AIError = {
                    type: errorType,
                    message: 'test',
                    retryable: false,
                    provider: 'anthropic',
                };
                expect(error.type).toBe(errorType);
            });
        });
    });

    describe('isProviderSupported utility', () => {
        it('should return true for supported providers', () => {
            expect(isProviderSupported('anthropic')).toBe(true);
            expect(isProviderSupported('google')).toBe(true);
            expect(isProviderSupported('openai')).toBe(true);
            expect(isProviderSupported('openai-compatible')).toBe(true);
        });

        it('should return false for unsupported providers', () => {
            expect(isProviderSupported('unsupported')).toBe(false);
            expect(isProviderSupported('')).toBe(false);
            expect(isProviderSupported('ANTHROPIC')).toBe(false); // case sensitive
        });
    });
});
