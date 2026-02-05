export const DEFAULT_MODEL_NAME = 'claude-4.5-sonnet'

export type AgentModelName = keyof typeof AGENT_MODEL_DEFINITIONS
export type AgentModelProvider = 'openai' | 'anthropic' | 'google' | 'openai-compatible'

export interface AgentModelDefinition {
	name: AgentModelName
	id: string
	provider: AgentModelProvider

	// Overrides the default thinking behavior for that provider
	thinking?: boolean

	// If true, model is hidden from UI but code remains intact
	hidden?: boolean
}

/**
 * Get the full information about a model from its name.
 * @param modelName - The name of the model.
 * @returns The full definition of the model.
 */
export function getAgentModelDefinition(modelName: AgentModelName): AgentModelDefinition {
	const definition = AGENT_MODEL_DEFINITIONS[modelName]
	if (!definition) {
		throw new Error(`Model ${modelName} not found`)
	}
	return definition
}

/**
 * Get the provider for a given model ID.
 * Used for routing in streamAgent.
 * @param modelId - The model name/ID to look up.
 * @returns The provider for the model, or 'openai-compatible' for unknown models.
 */
export function getProviderForModel(modelId: string): AgentModelProvider {
	const modelNames = Object.keys(AGENT_MODEL_DEFINITIONS) as AgentModelName[]
	const matchingModel = modelNames.find((name) => name === modelId)

	if (!matchingModel) {
		// Unknown models are assumed to be from openai-compatible provider (Ollama, etc.)
		return 'openai-compatible'
	}

	return AGENT_MODEL_DEFINITIONS[matchingModel].provider
}

/**
 * Check if a model name is a known predefined model.
 */
export function isKnownModel(modelName: string): modelName is AgentModelName {
	return modelName in AGENT_MODEL_DEFINITIONS
}

/**
 * Get model definition for known models, or create a dynamic definition for unknown models.
 * Unknown models are assumed to be from the openai-compatible provider.
 */
export function getModelDefinition(modelName: string): AgentModelDefinition {
	if (isKnownModel(modelName)) {
		return AGENT_MODEL_DEFINITIONS[modelName]
	}
	// Dynamic model from openai-compatible provider
	return {
		name: modelName as AgentModelName,
		id: modelName,
		provider: 'openai-compatible',
	}
}

/**
 * Convert API model ID to friendly model name.
 * This handles cases where settings might have stored the API ID instead of the friendly name.
 * @param modelIdOrName - Either an API model ID or a friendly name
 * @returns The friendly model name, or undefined if not found
 */
export function normalizeModelName(modelIdOrName: string): AgentModelName | undefined {
	// First check if it's already a valid model name
	if (modelIdOrName in AGENT_MODEL_DEFINITIONS) {
		return modelIdOrName as AgentModelName
	}

	// Otherwise, search for a model definition with this API ID
	const modelNames = Object.keys(AGENT_MODEL_DEFINITIONS) as AgentModelName[]
	const matchingModel = modelNames.find(
		(name) => AGENT_MODEL_DEFINITIONS[name].id === modelIdOrName
	)

	return matchingModel
}

export const AGENT_MODEL_DEFINITIONS = {
	// Strongly recommended
	'claude-4.5-sonnet': {
		name: 'claude-4.5-sonnet',
		id: 'claude-sonnet-4-5-20250929',
		provider: 'anthropic',
	},

	// Recommended
	'claude-4-sonnet': {
		name: 'claude-4-sonnet',
		id: 'claude-sonnet-4-20250514',
		provider: 'anthropic',
	},

	// Recommended
	'claude-3.7-sonnet': {
		name: 'claude-3.7-sonnet',
		id: 'claude-3-7-sonnet-20250219',
		provider: 'anthropic',
	},

	// Hidden - Gemini provider temporarily disabled in UI
	'gemini-2.5-flash': {
		name: 'gemini-2.5-flash',
		id: 'gemini-2.5-flash',
		provider: 'google',
		hidden: true,
	},

	// Hidden - Gemini provider temporarily disabled in UI
	'gemini-2.5-pro': {
		name: 'gemini-2.5-pro',
		id: 'gemini-2.5-pro',
		provider: 'google',
		thinking: true,
		hidden: true,
	},

	// Not recommended
	'gpt-5': {
		name: 'gpt-5',
		id: 'gpt-5-2025-08-07',
		provider: 'openai',
	},

	// Mildly recommended
	'gpt-4.1': {
		name: 'gpt-4.1',
		id: 'gpt-4.1-2025-04-14',
		provider: 'openai',
	},

	// Mildly recommended
	'gpt-4o': {
		name: 'gpt-4o',
		id: 'gpt-4o',
		provider: 'openai',
	},
} as const
