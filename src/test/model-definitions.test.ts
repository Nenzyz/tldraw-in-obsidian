import { describe, it, expect } from 'vitest';
import {
	AGENT_MODEL_DEFINITIONS,
	getAgentModelDefinition,
	getProviderForModel,
	AgentModelName,
	AgentModelProvider,
} from '../ai/models';

describe('Model Definitions', () => {
	describe('getAgentModelDefinition', () => {
		it('should return correct provider for Anthropic models', () => {
			const claudeSonnet45 = getAgentModelDefinition('claude-4.5-sonnet');
			expect(claudeSonnet45.provider).toBe('anthropic');
			expect(claudeSonnet45.id).toBe('claude-sonnet-4-5-20250929');

			const claudeSonnet4 = getAgentModelDefinition('claude-4-sonnet');
			expect(claudeSonnet4.provider).toBe('anthropic');

			const claude37 = getAgentModelDefinition('claude-3.7-sonnet');
			expect(claude37.provider).toBe('anthropic');
		});

		it('should return correct provider for Google models', () => {
			const geminiFlash = getAgentModelDefinition('gemini-2.5-flash');
			expect(geminiFlash.provider).toBe('google');
			expect(geminiFlash.id).toBe('gemini-2.5-flash');

			const geminiPro = getAgentModelDefinition('gemini-2.5-pro');
			expect(geminiPro.provider).toBe('google');
			expect(geminiPro.id).toBe('gemini-2.5-pro');
		});

		it('should return correct provider for OpenAI models', () => {
			const gpt4o = getAgentModelDefinition('gpt-4o');
			expect(gpt4o.provider).toBe('openai');
			expect(gpt4o.id).toBe('gpt-4o');

			const gpt41 = getAgentModelDefinition('gpt-4.1');
			expect(gpt41.provider).toBe('openai');
			expect(gpt41.id).toBe('gpt-4.1-2025-04-14');

			const gpt5 = getAgentModelDefinition('gpt-5');
			expect(gpt5.provider).toBe('openai');
			expect(gpt5.id).toBe('gpt-5-2025-08-07');
		});

		it('should throw error for unknown models', () => {
			expect(() => getAgentModelDefinition('unknown-model' as AgentModelName)).toThrow(
				'Model unknown-model not found'
			);
		});
	});

	describe('all enabled models validation', () => {
		it('should have valid id and provider fields for all models', () => {
			const modelNames = Object.keys(AGENT_MODEL_DEFINITIONS) as AgentModelName[];

			for (const modelName of modelNames) {
				const model = getAgentModelDefinition(modelName);

				// Verify required fields exist
				expect(model.name).toBe(modelName);
				expect(model.id).toBeTruthy();
				expect(model.provider).toBeTruthy();

				// Verify provider is a valid type
				expect(['anthropic', 'google', 'openai']).toContain(model.provider);
			}
		});

		it('should have all expected providers represented', () => {
			const modelNames = Object.keys(AGENT_MODEL_DEFINITIONS) as AgentModelName[];
			const providers = new Set(modelNames.map((name) => getAgentModelDefinition(name).provider));

			expect(providers.has('anthropic')).toBe(true);
			expect(providers.has('google')).toBe(true);
			expect(providers.has('openai')).toBe(true);
		});
	});

	describe('thinking flag', () => {
		it('should have thinking flag set correctly for gemini-2.5-pro', () => {
			const geminiPro = getAgentModelDefinition('gemini-2.5-pro');
			expect(geminiPro.thinking).toBe(true);
		});

		it('should not have thinking flag for non-thinking models', () => {
			const geminiFlash = getAgentModelDefinition('gemini-2.5-flash');
			expect(geminiFlash.thinking).toBeUndefined();

			const claudeSonnet = getAgentModelDefinition('claude-4.5-sonnet');
			expect(claudeSonnet.thinking).toBeUndefined();

			const gpt4o = getAgentModelDefinition('gpt-4o');
			expect(gpt4o.thinking).toBeUndefined();
		});
	});

	describe('getProviderForModel', () => {
		it('should return correct provider for each model', () => {
			expect(getProviderForModel('claude-4.5-sonnet')).toBe('anthropic');
			expect(getProviderForModel('claude-4-sonnet')).toBe('anthropic');
			expect(getProviderForModel('claude-3.7-sonnet')).toBe('anthropic');

			expect(getProviderForModel('gemini-2.5-flash')).toBe('google');
			expect(getProviderForModel('gemini-2.5-pro')).toBe('google');

			expect(getProviderForModel('gpt-4o')).toBe('openai');
			expect(getProviderForModel('gpt-4.1')).toBe('openai');
			expect(getProviderForModel('gpt-5')).toBe('openai');
		});

		it('should throw error for unknown models', () => {
			expect(() => getProviderForModel('unknown-model')).toThrow(
				'Unknown model: unknown-model'
			);
		});
	});
});
