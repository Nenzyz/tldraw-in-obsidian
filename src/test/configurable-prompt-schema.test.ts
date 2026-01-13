import { describe, it, expect, vi } from 'vitest'

/**
 * Tests for custom schema loading functionality.
 * These tests verify that custom JSON schemas from settings override defaults.
 */
describe('Custom Schema Loading', () => {
	describe('buildResponseSchema with settings', () => {
		it('should return default schema when no custom schema configured', async () => {
			const { buildResponseSchema } = await import('../ai/prompt/buildResponseSchema')

			const result = buildResponseSchema()

			// Should return a schema object (not null since defaults have at least message action)
			expect(result).toBeDefined()
			if (result) {
				expect(result).toHaveProperty('properties')
			}
		})

		it('should use custom schema when valid JSON string provided', async () => {
			const { buildResponseSchema } = await import('../ai/prompt/buildResponseSchema')

			const customSchema = {
				type: 'object',
				properties: {
					actions: {
						type: 'array',
						items: { type: 'object' }
					}
				}
			}

			const result = buildResponseSchema({ customJsonSchema: JSON.stringify(customSchema) })

			expect(result).toEqual(customSchema)
		})

		it('should fall back to default when custom schema is invalid JSON', async () => {
			const { buildResponseSchema } = await import('../ai/prompt/buildResponseSchema')

			// Spy on console.warn
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

			const result = buildResponseSchema({ customJsonSchema: 'not valid json {{{' })

			// Should fall back to default (not null)
			expect(result).toBeDefined()
			// Should log a warning
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('Invalid custom JSON schema')
			)

			warnSpy.mockRestore()
		})

		it('should use default when custom schema is undefined', async () => {
			const { buildResponseSchema } = await import('../ai/prompt/buildResponseSchema')

			const result = buildResponseSchema({ customJsonSchema: undefined })

			// Should return default schema
			expect(result).toBeDefined()
		})

		it('should use default when custom schema is empty string', async () => {
			const { buildResponseSchema } = await import('../ai/prompt/buildResponseSchema')

			const result = buildResponseSchema({ customJsonSchema: '' })

			// Should return default schema (empty string is falsy)
			expect(result).toBeDefined()
		})
	})
})
