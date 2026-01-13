/**
 * Integration tests for AI providers.
 *
 * These tests make real API calls to verify providers work correctly.
 * Set environment variables for the providers you want to test:
 * - ANTHROPIC_API_KEY
 * - OPENAI_API_KEY
 * - GOOGLE_API_KEY (for Gemini)
 *
 * Run with: npm test -- src/test/provider-integration.test.ts
 */

import { describe, it, expect } from 'vitest';

// Simple test prompt that should work with all providers
const TEST_SYSTEM_PROMPT = `You are a helpful assistant that responds in JSON format.
Respond with an actions array containing a single message action.
Example: {"actions": [{"_type": "message", "content": "Hello!"}]}`;

const TEST_USER_MESSAGE = 'Say hello in exactly 3 words';

describe('Provider Integration Tests', () => {
    // Anthropic Integration Test
    describe('Anthropic Provider', () => {
        const apiKey = process.env.ANTHROPIC_API_KEY;

        it.skipIf(!apiKey)('should stream actions from Claude', async () => {
            const { streamAgentActions } = await import('../ai/providers/anthropic');

            const actions: Array<{ _type: string; complete: boolean; [key: string]: unknown }> = [];

            for await (const action of streamAgentActions({
                apiKey: apiKey!,
                modelId: 'claude-sonnet-4-20250514',
                messages: [{ role: 'user', content: TEST_USER_MESSAGE }],
                systemPrompt: TEST_SYSTEM_PROMPT,
                maxTokens: 256,
                temperature: 0,
            })) {
                actions.push(action);
                console.log('[Anthropic] Action:', action._type, action.complete ? '(complete)' : '(streaming)');
            }

            // Should have at least one action
            expect(actions.length).toBeGreaterThan(0);

            // Last action should be complete
            const lastAction = actions[actions.length - 1];
            expect(lastAction.complete).toBe(true);
            expect(lastAction._type).toBe('message');

            console.log('[Anthropic] Final action:', JSON.stringify(lastAction, null, 2));
        }, 30000); // 30 second timeout

        it.skipIf(!apiKey)('should test connection and fetch models', async () => {
            const { testAnthropicConnection } = await import('../ai/providers/anthropic');

            const result = await testAnthropicConnection(apiKey!);

            expect(result.success).toBe(true);
            expect(result.models).toBeDefined();
            expect(result.models!.length).toBeGreaterThan(0);

            console.log('[Anthropic] Available models:', result.models!.map(m => m.displayName).join(', '));
        }, 15000);
    });

    // OpenAI Integration Test
    describe('OpenAI Provider', () => {
        const apiKey = process.env.OPENAI_API_KEY;

        it.skipIf(!apiKey)('should stream actions from GPT-4o', async () => {
            const { streamAgentActions } = await import('../ai/providers/openai');

            const actions: Array<{ _type: string; complete: boolean; [key: string]: unknown }> = [];

            for await (const action of streamAgentActions({
                apiKey: apiKey!,
                modelId: 'gpt-4o',
                messages: [{ role: 'user', content: TEST_USER_MESSAGE }],
                systemPrompt: TEST_SYSTEM_PROMPT,
                maxTokens: 256,
                temperature: 0,
            })) {
                actions.push(action);
                console.log('[OpenAI] Action:', action._type, action.complete ? '(complete)' : '(streaming)');
            }

            // Should have at least one action
            expect(actions.length).toBeGreaterThan(0);

            // Last action should be complete
            const lastAction = actions[actions.length - 1];
            expect(lastAction.complete).toBe(true);
            expect(lastAction._type).toBe('message');

            console.log('[OpenAI] Final action:', JSON.stringify(lastAction, null, 2));
        }, 30000);

        it.skipIf(!apiKey)('should test connection and fetch models', async () => {
            const { testOpenAIConnection } = await import('../ai/providers/openai');

            const result = await testOpenAIConnection(apiKey!);

            expect(result.success).toBe(true);
            expect(result.models).toBeDefined();
            expect(result.models!.length).toBeGreaterThan(0);

            console.log('[OpenAI] Available models:', result.models!.map(m => m.displayName).join(', '));
        }, 15000);

        it.skipIf(!apiKey)('should work with GPT-4o-mini', async () => {
            const { streamAgentActions } = await import('../ai/providers/openai');

            const actions: Array<{ _type: string; complete: boolean; [key: string]: unknown }> = [];

            for await (const action of streamAgentActions({
                apiKey: apiKey!,
                modelId: 'gpt-4o-mini',
                messages: [{ role: 'user', content: TEST_USER_MESSAGE }],
                systemPrompt: TEST_SYSTEM_PROMPT,
                maxTokens: 256,
                temperature: 0.5, // Test with non-zero temperature
            })) {
                actions.push(action);
            }

            expect(actions.length).toBeGreaterThan(0);
            const lastAction = actions[actions.length - 1];
            expect(lastAction.complete).toBe(true);

            console.log('[OpenAI GPT-4o-mini] Final action:', JSON.stringify(lastAction, null, 2));
        }, 30000);
    });

    // Google Gemini Integration Test
    describe('Google Gemini Provider', () => {
        const apiKey = process.env.GOOGLE_API_KEY;

        it.skipIf(!apiKey)('should stream actions from Gemini', async () => {
            const { streamGeminiAgentActions } = await import('../ai/providers/gemini');

            const actions: Array<{ _type: string; complete: boolean; [key: string]: unknown }> = [];

            for await (const action of streamGeminiAgentActions({
                apiKey: apiKey!,
                modelId: 'gemini-2.0-flash',
                messages: [{ role: 'user', content: TEST_USER_MESSAGE }],
                systemPrompt: TEST_SYSTEM_PROMPT,
                maxTokens: 256,
                temperature: 0,
            })) {
                actions.push(action);
                console.log('[Gemini] Action:', action._type, action.complete ? '(complete)' : '(streaming)');
            }

            // Should have at least one action
            expect(actions.length).toBeGreaterThan(0);

            // Last action should be complete
            const lastAction = actions[actions.length - 1];
            expect(lastAction.complete).toBe(true);
            expect(lastAction._type).toBe('message');

            console.log('[Gemini] Final action:', JSON.stringify(lastAction, null, 2));
        }, 30000);

        it.skipIf(!apiKey)('should test connection and fetch models', async () => {
            const { testGeminiConnection } = await import('../ai/providers/gemini');

            const result = await testGeminiConnection(apiKey!);

            expect(result.success).toBe(true);
            expect(result.models).toBeDefined();
            expect(result.models!.length).toBeGreaterThan(0);

            console.log('[Gemini] Available models:', result.models!.map(m => m.displayName).join(', '));
        }, 15000);
    });

    // Cross-provider consistency test
    describe('Cross-Provider Consistency', () => {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;
        const googleKey = process.env.GOOGLE_API_KEY;

        it.skipIf(!anthropicKey || !openaiKey || !googleKey)('all providers should return similar action structure', async () => {
            const { streamAgentActions: streamAnthropic } = await import('../ai/providers/anthropic');
            const { streamAgentActions: streamOpenAI } = await import('../ai/providers/openai');
            const { streamGeminiAgentActions: streamGemini } = await import('../ai/providers/gemini');

            const options = {
                messages: [{ role: 'user' as const, content: 'Say exactly: Hello World' }],
                systemPrompt: TEST_SYSTEM_PROMPT,
                maxTokens: 256,
                temperature: 0,
            };

            // Collect final actions from each provider
            const results: Record<string, unknown> = {};

            // Anthropic
            for await (const action of streamAnthropic({ ...options, apiKey: anthropicKey!, modelId: 'claude-sonnet-4-20250514' })) {
                if (action.complete) results.anthropic = action;
            }

            // OpenAI
            for await (const action of streamOpenAI({ ...options, apiKey: openaiKey!, modelId: 'gpt-4o' })) {
                if (action.complete) results.openai = action;
            }

            // Gemini
            for await (const action of streamGemini({ ...options, apiKey: googleKey!, modelId: 'gemini-2.0-flash' })) {
                if (action.complete) results.gemini = action;
            }

            // All should have _type field
            expect((results.anthropic as { _type: string })._type).toBe('message');
            expect((results.openai as { _type: string })._type).toBe('message');
            expect((results.gemini as { _type: string })._type).toBe('message');

            console.log('Cross-provider results:', JSON.stringify(results, null, 2));
        }, 60000);
    });
});
