import { describe, it, expect } from 'vitest'

/**
 * Tests for default placeholder functionality.
 * These tests verify that the default schema and prompt work correctly
 * when no custom values are configured.
 */
describe('Default Placeholders', () => {
	describe('DEFAULT_JSON_SCHEMA', () => {
		it('should have actions array property', async () => {
			// Import the module to test the schema structure
			const { DEFAULT_JSON_SCHEMA } = await import('../ai/shared/parts/SystemPromptPartUtil')

			expect(DEFAULT_JSON_SCHEMA).toBeDefined()
			expect(DEFAULT_JSON_SCHEMA.properties).toBeDefined()
			expect(DEFAULT_JSON_SCHEMA.properties.actions).toBeDefined()
			expect(DEFAULT_JSON_SCHEMA.properties.actions.type).toBe('array')
		})

		it('should define message action type', async () => {
			const { DEFAULT_JSON_SCHEMA } = await import('../ai/shared/parts/SystemPromptPartUtil')

			const actionsItems = DEFAULT_JSON_SCHEMA.properties.actions.items
			expect(actionsItems).toBeDefined()
			expect(actionsItems.anyOf).toBeDefined()

			// Find message action type
			const messageAction = actionsItems.anyOf.find(
				(item: { title?: string }) => item.title === 'Message'
			)
			expect(messageAction).toBeDefined()
			expect(messageAction.properties._type.const).toBe('message')
			expect(messageAction.properties.text.type).toBe('string')
		})

		it('should be valid JSON schema structure', async () => {
			const { DEFAULT_JSON_SCHEMA } = await import('../ai/shared/parts/SystemPromptPartUtil')

			// Verify it has required JSON Schema fields
			expect(DEFAULT_JSON_SCHEMA.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
			expect(DEFAULT_JSON_SCHEMA.type).toBe('object')
			expect(DEFAULT_JSON_SCHEMA.required).toContain('actions')
		})
	})

	describe('getDefaultSystemPrompt', () => {
		it('should return non-empty prompt string', async () => {
			const { getDefaultSystemPrompt } = await import('../ai/shared/parts/SystemPromptPartUtil')

			const prompt = getDefaultSystemPrompt()
			expect(typeof prompt).toBe('string')
			expect(prompt.length).toBeGreaterThan(50)
		})

		it('should include JSON schema in prompt', async () => {
			const { getDefaultSystemPrompt, DEFAULT_JSON_SCHEMA } = await import('../ai/shared/parts/SystemPromptPartUtil')

			const prompt = getDefaultSystemPrompt()
			// The prompt should contain the stringified schema
			expect(prompt).toContain('"actions"')
			expect(prompt).toContain('"message"')
		})

		it('should explain actions array format', async () => {
			const { getDefaultSystemPrompt } = await import('../ai/shared/parts/SystemPromptPartUtil')

			const prompt = getDefaultSystemPrompt()
			expect(prompt.toLowerCase()).toContain('actions')
			expect(prompt.toLowerCase()).toContain('message')
		})
	})

	describe('SystemPromptPartUtil.buildSystemPrompt', () => {
		it('should use default prompt when no custom prompt configured', async () => {
			const { SystemPromptPartUtil, getDefaultSystemPrompt } = await import('../ai/shared/parts/SystemPromptPartUtil')

			const util = new SystemPromptPartUtil()
			const part = util.getPart()
			const result = util.buildSystemPrompt(part)

			// Should return the default prompt
			expect(result).toBe(getDefaultSystemPrompt())
		})
	})
})
