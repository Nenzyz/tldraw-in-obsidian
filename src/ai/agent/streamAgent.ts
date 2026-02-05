/**
 * Stream agent actions from AI providers
 *
 * Flow:
 * 1. Agent window has friendly model name (e.g., "gpt-4o")
 * 2. Look up provider + real API ID from AGENT_MODEL_DEFINITIONS
 * 3. Get API key for that provider from settings
 * 4. Call provider's API with real model ID
 */

import { getProvider } from '../providers'
import { getModelDefinition, AgentModelProvider } from '../models'
import { buildMessages } from '../prompt/buildMessages'
import { buildSystemPrompt } from '../prompt/buildSystemPrompt'
import { ProviderSessionState } from '../providers/types'
import { AgentAction } from '../shared/types/AgentAction'
import { BaseAgentPrompt } from '../shared/types/AgentPrompt'
import { Streaming } from '../shared/types/Streaming'

export interface AISettings {
	providers?: {
		anthropic?: { apiKey?: string }
		google?: { apiKey?: string }
		openai?: { apiKey?: string }
		'openai-compatible'?: { apiKey?: string; baseUrl?: string }
	}
	maxTokens?: number
	/** Temperature for AI responses (0-1). Lower = more deterministic. Not supported by all models. */
	temperature?: number
	// Legacy field for backward compatibility
	apiKey?: string
	/**
	 * Provider-specific session state for caching and conversation continuity.
	 * Used to pass state from TldrawAgent to provider implementations.
	 * - Anthropic: Used to track cache state across requests
	 * - OpenAI: Contains previous response ID for session continuity
	 */
	providerSessionState?: ProviderSessionState
	/**
	 * Custom system prompt to use instead of the default.
	 * When set and non-empty, this prompt is used for AI interactions.
	 */
	customSystemPrompt?: string
	/**
	 * Custom JSON schema to use instead of the default.
	 * Should be a valid JSON string representing the response schema.
	 */
	customJsonSchema?: string
}

export interface StreamAgentOptions {
	prompt: BaseAgentPrompt
	signal: AbortSignal
	/** Model name from agent window (e.g., "gpt-4o" or dynamic Ollama model) */
	modelName: string
	/** Settings containing API keys for all providers */
	settings: AISettings
}

/**
 * Get the API key for a provider from settings.
 */
export function getApiKeyForProvider(
	settings: AISettings,
	provider: AgentModelProvider,
): string | undefined {
	// Try new multi-provider schema first
	const providerApiKey = settings?.providers?.[provider]?.apiKey
	if (providerApiKey !== undefined) {
		return providerApiKey
	}

	// Fall back to old schema for anthropic (backward compatibility)
	if (provider === 'anthropic') {
		return settings?.apiKey
	}

	return undefined
}

/**
 * Stream agent actions from the model.
 *
 * @param modelName - Friendly model name from agent window (e.g., "gpt-4o", "claude-4.5-sonnet")
 * @param settings - Settings containing API keys for all providers
 */
export async function* streamAgent({
	prompt,
	signal,
	modelName,
	settings,
}: StreamAgentOptions): AsyncGenerator<Streaming<AgentAction>> {
	const modelDefinition = getModelDefinition(modelName)
	const provider = modelDefinition.provider
	const realModelId = modelDefinition.id

	// 2. Get API key for that provider
	const apiKey = getApiKeyForProvider(settings, provider)

	if (!apiKey && provider !== 'openai-compatible') {
		const providerNames: Record<AgentModelProvider, string> = {
			anthropic: 'Anthropic (Claude)',
			google: 'Google (Gemini)',
			openai: 'OpenAI (GPT)',
			'openai-compatible': 'OpenAI-Compatible (Ollama)',
		}
		const displayName = providerNames[provider] || provider
		throw new Error(
			`API key for ${displayName} is not configured. ` +
			`Please add your ${displayName} API key in Settings > AI.`,
		)
	}

	// 3. Get the provider implementation
	const providerImpl = await getProvider(provider)

	// 4. Build messages and system prompt
	const systemPrompt = buildSystemPrompt(prompt, {
		customSystemPrompt: settings.customSystemPrompt,
		customJsonSchema: settings.customJsonSchema,
	})
	const messages = buildMessages(prompt)

	const apiMessages = messages.map(msg => ({
		role: msg.role as 'user' | 'assistant',
		content: msg.content,
	}))

	const maxTokens = settings?.maxTokens || 8192
	const temperature = settings?.temperature ?? 0

	// 5. Extract provider-specific session state for caching/session continuity
	const providerSessionState = settings?.providerSessionState
	const previousResponseId = providerSessionState?.openai?.responseId
	const baseUrl = provider === 'openai-compatible'
		? settings?.providers?.['openai-compatible']?.baseUrl
		: undefined

	// 6. Call provider's API with real model ID
	for await (const action of providerImpl.streamAgentActions({
		apiKey: apiKey ?? '',
		modelId: realModelId,
		messages: apiMessages,
		systemPrompt,
		maxTokens,
		temperature,
		signal,
		baseUrl,
		// Pass through session options for provider-specific handling
		previousResponseId,
		// Enable caching by default (providers can check this)
		enableCaching: true,
	})) {
		yield action as Streaming<AgentAction>
	}
}
