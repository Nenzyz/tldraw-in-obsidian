/**
 * Integration test for Anthropic API connection
 * Run with: npx vitest run src/test/anthropic-connection.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    testAnthropicConnection,
    streamAgentActions,
} from '../ai/anthropic-client';

// Test API key - replace with your own for testing
const TEST_API_KEY = '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';

describe('Anthropic API Connection', () => {
    it('should connect and fetch available models', async () => {
        const result = await testAnthropicConnection(TEST_API_KEY);

        console.log('Connection result:', result);

        expect(result.success).toBe(true);
        expect(result.models).toBeDefined();
        expect(result.models!.length).toBeGreaterThan(0);

        // Log available models
        console.log('Available models:', result.models?.map(m => m.displayName).join(', '));
    }, 30000); // 30 second timeout for API call

    it('should stream agent actions from Claude', async () => {
        const messages = [
            {
                role: 'user' as const,
                content: 'Say hello in one word',
            },
        ];

        const systemPrompt = `You are an AI assistant that responds with JSON actions.
Always respond with a JSON object containing an "actions" array.
Each action must have a "_type" field.
For simple responses, use: {"actions": [{"_type": "message", "message": "your response"}]}`;

        const actions: Array<{ _type: string; complete: boolean; [key: string]: unknown }> = [];

        try {
            for await (const action of streamAgentActions(
                TEST_API_KEY,
                'claude-sonnet-4-5-20250929',
                messages,
                systemPrompt,
                1024,
            )) {
                console.log('Received action:', action);
                actions.push(action);
            }
        } catch (error) {
            console.error('Stream error:', error);
            throw error;
        }

        console.log('Total actions received:', actions.length);

        // Should have received at least one action
        expect(actions.length).toBeGreaterThan(0);

        // The last action should be complete
        const lastAction = actions[actions.length - 1];
        expect(lastAction.complete).toBe(true);
        expect(lastAction._type).toBeDefined();
    }, 60000); // 60 second timeout for streaming
});
