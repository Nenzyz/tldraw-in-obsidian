import z from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { getAgentActionUtilsRecord } from '../shared/AgentUtils'
import { PromptBuildSettings } from './buildSystemPrompt'

/**
 * Build the JSON schema for AI responses.
 * Uses custom schema from settings if valid, otherwise builds from action utilities.
 *
 * @param settings - Optional settings containing custom schema.
 * @returns JSON schema object or null if unable to build.
 */
export function buildResponseSchema(settings?: PromptBuildSettings) {
	// Check for custom schema in settings first
	if (settings?.customJsonSchema) {
		try {
			const parsedSchema = JSON.parse(settings.customJsonSchema)
			return parsedSchema
		} catch {
			console.warn('Invalid custom JSON schema, using default')
			// Fall through to default schema building
		}
	}

	// Build default schema from action utilities
	return buildDefaultResponseSchema()
}

/**
 * Build the default response schema from registered action utilities.
 * This creates a schema based on Zod schemas defined in action utils.
 */
function buildDefaultResponseSchema() {
	const actionUtils = getAgentActionUtilsRecord()
	const actionSchemas = Object.values(actionUtils)
		.map((util) => util.getSchema())
		.filter((schema): schema is z.ZodTypeAny => schema !== null)

	if (actionSchemas.length < 2) {
		// z.union requires at least 2 schemas
		return null
	}

	const actionSchema = z.union(actionSchemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
	const schema = z.object({
		actions: z.array(actionSchema),
	})

	return zodToJsonSchema(schema, { $refStrategy: 'none' })
}
