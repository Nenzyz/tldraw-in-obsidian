import { getAgentActionUtilsRecord, getPromptPartUtilsRecord } from '../shared/AgentUtils'
import { AgentPrompt } from '../shared/types/AgentPrompt'

/**
 * Settings that can be passed to customize prompt building.
 */
export interface PromptBuildSettings {
	/** Custom system prompt to use instead of the default */
	customSystemPrompt?: string
	/** Custom JSON schema to use instead of the default */
	customJsonSchema?: string
}

/**
 * Build a system prompt from all of the prompt parts.
 *
 * If you want to bypass the `PromptPartUtil` system, replace this function with
 * one that returns a hardcoded value.
 *
 * @param prompt - The prompt to build a system prompt for.
 * @param settings - Optional settings for custom prompt/schema.
 * @returns The system prompt.
 */
export function buildSystemPrompt(prompt: AgentPrompt, settings?: PromptBuildSettings): string {
	const propmtUtils = getPromptPartUtilsRecord()
	const messages: string[] = []

	for (const part of Object.values(prompt)) {
		const propmtUtil = propmtUtils[part.type]
		if (!propmtUtil) continue
		const systemMessage = propmtUtil.buildSystemPrompt(part, settings)
		if (systemMessage) {
			messages.push(systemMessage)
		}
	}

	const actionUtils = getAgentActionUtilsRecord()
	for (const actionUtil of Object.values(actionUtils)) {
		const systemMessage = actionUtil.buildSystemPrompt()
		if (systemMessage) {
			messages.push(systemMessage)
		}
	}

	return messages.join('')
}
