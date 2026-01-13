import { PromptBuildSettings } from '../../prompt/buildSystemPrompt'
import { BasePromptPart } from '../types/BasePromptPart'
import { PromptPartUtil } from './PromptPartUtil'

export type SystemPromptPart = BasePromptPart<'system'>

export class SystemPromptPartUtil extends PromptPartUtil<SystemPromptPart> {
	static override type = 'system' as const

	override getPart(): SystemPromptPart {
		return { type: 'system' }
	}

	override buildSystemPrompt(_part: SystemPromptPart, settings?: PromptBuildSettings) {
		// Use custom prompt from settings if provided and non-empty
		if (settings?.customSystemPrompt) {
			let prompt = settings.customSystemPrompt

			// Substitute {{JSON_SCHEMA}} placeholder with custom schema if provided
			if (prompt.includes('{{JSON_SCHEMA}}') && settings.customJsonSchema) {
				try {
					const schemaObj = JSON.parse(settings.customJsonSchema)
					const prettySchema = JSON.stringify(schemaObj, null, 2)
					prompt = prompt.replace('{{JSON_SCHEMA}}', prettySchema)
				} catch {
					console.warn('Failed to parse customJsonSchema for placeholder substitution')
				}
			}

			return prompt
		}
		return getDefaultSystemPrompt()
	}
}

/**
 * Default JSON schema for AI responses.
 * This minimal schema supports basic message responses.
 * For full functionality, configure a custom schema in plugin settings.
 */
export const DEFAULT_JSON_SCHEMA = {
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"actions": {
			"type": "array",
			"items": {
				"anyOf": [
					{
						"title": "Message",
						"description": "The AI sends a message to the user.",
						"type": "object",
						"properties": {
							"_type": { "type": "string", "const": "message" },
							"text": { "type": "string" }
						},
						"required": ["_type", "text"],
						"additionalProperties": false
					}
				]
			}
		}
	},
	"required": ["actions"],
	"additionalProperties": false
}

/**
 * Returns the default system prompt.
 * This minimal prompt enables basic AI chat functionality.
 * For full functionality, configure a custom prompt in plugin settings.
 */
export function getDefaultSystemPrompt() {
	return `# System Prompt

You are an AI assistant for a drawing canvas.
Respond with structured JSON data based on the schema provided.

Your response must include an "actions" array.
Use action type "message" with a "text" field to communicate with the user.

## JSON Schema

${JSON.stringify(DEFAULT_JSON_SCHEMA, null, 2)}`
}
