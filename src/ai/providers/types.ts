/**
 * Provider abstraction layer types for multi-provider AI integration.
 *
 * This module defines the unified interfaces that all AI providers
 * (Anthropic, Google Gemini, OpenAI) must implement.
 */

import type { AgentModelProvider } from '../models';

/**
 * Common error types across all AI providers.
 * Each provider maps its SDK-specific errors to these common types.
 */
export type AIErrorType =
    | 'invalid_api_key'
    | 'rate_limit'
    | 'network_error'
    | 'server_error'
    | 'context_exceeded'
    | 'unknown';

/**
 * Unified error structure for all AI providers.
 * Includes provider name for debugging and context.
 */
export interface AIError {
    /** The category of error that occurred */
    type: AIErrorType;
    /** Human-readable error message */
    message: string;
    /** Whether the operation can be retried */
    retryable: boolean;
    /** Which provider generated this error */
    provider: AgentModelProvider;
}

/**
 * Information about a model fetched from the provider API.
 */
export interface FetchedModel {
    /** The model's API identifier */
    id: string;
    /** Human-readable display name */
    displayName: string;
}

/**
 * Result of testing a provider connection.
 */
export interface ConnectionResult {
    /** Whether the connection test succeeded */
    success: boolean;
    /** Error message if connection failed */
    error?: string;
    /** Available models if connection succeeded */
    models?: FetchedModel[];
}

/**
 * Message content item - either text or image.
 */
export type MessageContentItem =
    | { type: 'text'; text: string }
    | { type: 'image'; image: string }; // base64 data URL

/**
 * A message in the conversation history.
 */
export interface Message {
    role: 'user' | 'assistant';
    content: string | MessageContentItem[];
}

/**
 * Provider-specific session state for caching and conversation continuity.
 *
 * This state is ephemeral and should NOT be persisted across Obsidian sessions.
 * - Anthropic: Tracks whether cache was created (for logging/debugging)
 * - OpenAI: Stores response ID for Responses API session continuity
 */
export interface ProviderSessionState {
    /** Anthropic-specific session state */
    anthropic?: {
        /** Whether cache was created in this session (for metrics/logging) */
        cacheCreated: boolean;
    };
    /** OpenAI-specific session state */
    openai?: {
        /** Response ID from previous request for session continuity */
        responseId: string;
    };
}

/**
 * Cache metrics returned from Anthropic provider.
 * Tracks token counts for cache creation vs cache reads.
 */
export interface CacheMetrics {
    /** Tokens used to create cache entries */
    created: number;
    /** Tokens read from cached entries */
    read: number;
}

/**
 * Options for streaming agent actions.
 */
export interface StreamOptions {
    /** API key for authentication */
    apiKey: string;
    /** Model ID to use for generation */
    modelId: string;
    /** Conversation message history */
    messages: Message[];
    /** System prompt for the model */
    systemPrompt: string;
    /** Maximum tokens to generate */
    maxTokens: number;
    /** Temperature for generation (0-1). Lower = more deterministic. */
    temperature?: number;
    /** Optional abort signal for cancellation */
    signal?: AbortSignal;
    /** Base URL for OpenAI-compatible providers */
    baseUrl?: string;
    /**
     * Previous response ID for OpenAI Responses API session continuity.
     * When provided, enables server-side conversation state persistence.
     */
    previousResponseId?: string;
    /**
     * Whether to enable provider-specific caching (default: true).
     * Set to false for debugging or when cache behavior is unwanted.
     * - Anthropic: Controls cache_control on system prompt and messages
     * - OpenAI: Has no effect (session continuity is separate from caching)
     */
    enableCaching?: boolean;
}

/**
 * A single action yielded from the streaming generator.
 * The `complete` field indicates whether this action is fully parsed.
 * The `time` field indicates milliseconds since action started.
 */
export interface StreamAction {
    /** The type of action (e.g., 'message', 'createShape', etc.) */
    _type: string;
    /** Whether this action is fully parsed or still streaming */
    complete: boolean;
    /** Time in milliseconds since this action started */
    time: number;
    /**
     * Response ID returned by OpenAI Responses API.
     * Present in final action (when complete: true) for session continuity.
     */
    responseId?: string;
    /**
     * Cache metrics from Anthropic provider.
     * Present in final action (when complete: true) if caching was used.
     */
    cacheMetrics?: CacheMetrics;
    /** Additional action-specific data */
    [key: string]: unknown;
}

/**
 * Unified interface that all AI providers must implement.
 *
 * Each provider (Anthropic, Google, OpenAI) implements this interface
 * with SDK-specific logic while exposing a consistent API surface.
 */
export interface AIProvider {
    /** The provider's identifier */
    readonly name: AgentModelProvider;

    /**
     * Create a client instance for the provider's SDK.
     *
     * @param apiKey - The API key for authentication
     * @returns The provider-specific client instance
     */
    createClient(apiKey: string): unknown;

    /**
     * Stream agent actions from the AI model.
     *
     * This is the primary method for getting structured responses
     * from the AI model in a streaming fashion. Each yielded action
     * represents a parsed (or partially parsed) action from the model.
     *
     * @param options - Streaming configuration options
     * @yields StreamAction objects as they are parsed from the response
     */
    streamAgentActions(options: StreamOptions): AsyncGenerator<StreamAction>;

    /**
     * Test the connection to the provider's API.
     *
     * Used to validate API keys and fetch available models.
     *
     * @param apiKey - The API key to test
     * @returns Connection result with success status and available models
     */
    testConnection(apiKey: string, baseUrl?: string): Promise<ConnectionResult>;

    /**
     * Parse a provider-specific error into the common AIError format.
     *
     * @param error - The raw error from the provider's SDK
     * @returns Normalized AIError structure
     */
    parseError(error: unknown): AIError;
}
