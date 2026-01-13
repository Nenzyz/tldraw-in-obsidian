import { describe, it, expect, vi } from 'vitest'

/**
 * Tests for custom prompt loading functionality.
 * These tests verify that custom prompts from settings override defaults.
 */
describe('Custom Prompt Loading', () => {
	describe('buildSystemPrompt with settings', () => {
		it('should use default prompt when no custom prompt configured', async () => {
			const { buildSystemPrompt } = await import('../ai/prompt/buildSystemPrompt')
			const { getDefaultSystemPrompt } = await import('../ai/shared/parts/SystemPromptPartUtil')

			// Create a minimal prompt object with system part
			const prompt = {
				system: { type: 'system' as const }
			}

			const result = buildSystemPrompt(prompt)

			// Should contain default prompt content
			expect(result).toContain('You are an AI assistant')
		})

		it('should use custom prompt when settings value present', async () => {
			const { buildSystemPrompt } = await import('../ai/prompt/buildSystemPrompt')

			const customPrompt = 'This is a custom system prompt for testing.'
			const prompt = {
				system: { type: 'system' as const }
			}

			const result = buildSystemPrompt(prompt, { customSystemPrompt: customPrompt })

			// Should use the custom prompt
			expect(result).toContain(customPrompt)
		})

		it('should use default when custom prompt is empty string', async () => {
			const { buildSystemPrompt } = await import('../ai/prompt/buildSystemPrompt')
			const { getDefaultSystemPrompt } = await import('../ai/shared/parts/SystemPromptPartUtil')

			const prompt = {
				system: { type: 'system' as const }
			}

			const result = buildSystemPrompt(prompt, { customSystemPrompt: '' })

			// Should use default prompt (empty string is falsy)
			expect(result).toContain('You are an AI assistant')
		})

		it('should use default when custom prompt is undefined', async () => {
			const { buildSystemPrompt } = await import('../ai/prompt/buildSystemPrompt')

			const prompt = {
				system: { type: 'system' as const }
			}

			const result = buildSystemPrompt(prompt, { customSystemPrompt: undefined })

			// Should use default prompt
			expect(result).toContain('You are an AI assistant')
		})
	})

	describe('SystemPromptPartUtil with settings', () => {
		it('should accept settings in buildSystemPrompt method', async () => {
			const { SystemPromptPartUtil, getDefaultSystemPrompt } = await import('../ai/shared/parts/SystemPromptPartUtil')

			const util = new SystemPromptPartUtil()
			const part = util.getPart()

			// Without settings - should use default
			const defaultResult = util.buildSystemPrompt(part)
			expect(defaultResult).toBe(getDefaultSystemPrompt())

			// With custom prompt setting
			const customPrompt = 'Custom prompt content here.'
			const customResult = util.buildSystemPrompt(part, { customSystemPrompt: customPrompt })
			expect(customResult).toBe(customPrompt)
		})
	})
})
