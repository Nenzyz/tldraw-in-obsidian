/**
 * OpenAI provider implementation.
 *
 * This module implements the AIProvider interface for OpenAI's GPT models.
 * It provides streaming agent actions with JSON mode for structured output.
 *
 * Supports two API paths:
 * - Responses API: Used when previousResponseId is provided for session continuity
 * - Chat Completions API: Default path for new conversations
 */

import OpenAI from 'openai';
import type {
    AIProvider,
    AIError,
    ConnectionResult,
    FetchedModel,
    StreamOptions,
    StreamAction,
} from './types';
import { closeAndParseJson } from './anthropic';
import { isRateLimitError, extractRetryDelay, sleep } from './rate-limit';

// Debug logging for agent flow
const DEBUG_AGENT = true;
function debugAgent(stage: string, ...args: unknown[]) {
    if (DEBUG_AGENT) {
        console.warn(`[OpenAI:${stage}]`, ...args);
    }
}

// Debug logging for session management (Responses API)
const DEBUG_SESSION = true;
function debugSession(stage: string, ...args: unknown[]) {
    if (DEBUG_SESSION) {
        console.warn(`[OpenAI:SESSION:${stage}]`, ...args);
    }
}

/**
 * Type for Responses API streaming event.
 * We define this locally to avoid complex type imports.
 */
interface ResponsesStreamEvent {
    type: string;
    response?: { id?: string };
    delta?: string;
    [key: string]: unknown;
}

/**
 * Create an OpenAI client with the given API key.
 *
 * Note: Uses dangerouslyAllowBrowser since we're running in Obsidian's
 * Electron environment which is technically a browser context.
 *
 * @param apiKey - The OpenAI API key
 * @returns Configured OpenAI client instance
 */
export function createOpenAIClient(apiKey: string): OpenAI {
    return new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true,
    });
}

/**
 * Parse an error from the OpenAI API into a structured AIError format.
 *
 * Maps OpenAI SDK-specific errors to the common AIError type for
 * consistent error handling across all providers.
 *
 * @param error - The error to parse (from OpenAI SDK)
 * @returns Normalized AIError structure
 */
export function parseOpenAIError(error: unknown): AIError {
    // Handle OpenAI API errors with status codes
    if (error instanceof OpenAI.APIError) {
        if (error.status === 401) {
            return {
                type: 'invalid_api_key',
                message: 'Invalid API key. Please check your OpenAI API key in settings.',
                retryable: false,
                provider: 'openai',
            };
        }
        if (error.status === 429) {
            return {
                type: 'rate_limit',
                message: 'Rate limit exceeded. Please wait and try again.',
                retryable: true,
                provider: 'openai',
            };
        }
        if (error.status >= 500) {
            return {
                type: 'server_error',
                message: 'OpenAI server error. Please try again later.',
                retryable: true,
                provider: 'openai',
            };
        }
    }

    // Handle Error objects
    if (error instanceof Error) {
        // Detect context length exceeded errors
        if (
            error.message.includes('context_length') ||
            error.message.includes('maximum context') ||
            error.message.includes('too many tokens') ||
            error.message.includes('max_tokens')
        ) {
            return {
                type: 'context_exceeded',
                message: 'The conversation is too long. Please start a new conversation or clear some history.',
                retryable: false,
                provider: 'openai',
            };
        }

        // Detect network errors
        if (error.message.includes('network') || error.message.includes('fetch')) {
            return {
                type: 'network_error',
                message: 'Network error. Please check your internet connection.',
                retryable: true,
                provider: 'openai',
            };
        }

        // Unknown error with message
        return {
            type: 'unknown',
            message: error.message,
            retryable: false,
            provider: 'openai',
        };
    }

    // Fallback for non-Error objects
    return {
        type: 'unknown',
        message: 'An unknown error occurred',
        retryable: false,
        provider: 'openai',
    };
}

/**
 * Format a model ID into a human-readable name.
 *
 * @param modelId - The raw model ID from the API
 * @returns Human-readable display name
 *
 * @example
 * formatModelName('gpt-4o-2024-11-20') // 'GPT-4o'
 * formatModelName('gpt-4.1-2025-04-14') // 'GPT-4.1'
 */
function formatModelName(modelId: string): string {
    return modelId
        .replace(/-\d{4}-\d{2}-\d{2}$/, '') // Remove date suffix
        .replace(/^gpt-/, 'GPT-')
        .replace(/^o(\d)/, 'o$1') // o1, o3, etc.
        .split('-')
        .map((part, index) => {
            if (index === 0) return part; // Keep GPT- prefix
            if (/^\d/.test(part)) return part; // Keep version numbers
            return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('-')
        .replace(/-mini/i, ' Mini')
        .replace(/-preview/i, ' Preview');
}

/**
 * Test the connection to the OpenAI API and fetch available models.
 *
 * @param apiKey - The API key to test
 * @returns Connection result with success status and available models
 */
export async function testOpenAIConnection(apiKey: string, _baseUrl?: string): Promise<ConnectionResult> {
    if (!apiKey || !apiKey.trim()) {
        return { success: false, error: 'API key is required' };
    }

    try {
        const client = createOpenAIClient(apiKey);

        // Fetch available models
        const modelsResponse = await client.models.list();

        // Filter to only GPT models and format them
        const models: FetchedModel[] = [];
        for await (const model of modelsResponse) {
            // Include GPT-4, GPT-4o, GPT-4.1, GPT-5, o1, o3 models
            if (
                model.id.startsWith('gpt-4') ||
                model.id.startsWith('gpt-5') ||
                model.id.startsWith('o1') ||
                model.id.startsWith('o3')
            ) {
                models.push({
                    id: model.id,
                    displayName: formatModelName(model.id),
                });
            }
        }

        // Sort by name
        models.sort((a, b) => a.displayName.localeCompare(b.displayName));

        return { success: true, models };
    } catch (error) {
        const parsedError = parseOpenAIError(error);
        return { success: false, error: parsedError.message };
    }
}

/**
 * Convert provider Message format to OpenAI ChatCompletionMessageParam format.
 *
 * @param messages - Array of provider messages
 * @param systemPrompt - The system prompt to prepend
 * @returns Array of OpenAI message parameters
 */
function convertToOpenAIMessages(
    messages: StreamOptions['messages'],
    systemPrompt: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    // Build the system message with JSON instruction
    const jsonSystemPrompt = `${systemPrompt}

IMPORTANT: You MUST respond with a valid JSON object containing an "actions" array. Each action in the array must have a "_type" field indicating the action type. Example format:
{"actions": [{"_type": "message", "content": "Hello!"}, {"_type": "createShape", "shape": {...}}]}`;

    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: jsonSystemPrompt },
    ];

    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            // Simple string content
            if (msg.role === 'user') {
                openaiMessages.push({
                    role: 'user',
                    content: msg.content,
                });
            } else {
                openaiMessages.push({
                    role: 'assistant',
                    content: msg.content,
                });
            }
        } else {
            // Array content with possible images - only supported for user messages
            const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = msg.content.map(item => {
                if (item.type === 'image') {
                    // OpenAI expects the full data URL format
                    return {
                        type: 'image_url' as const,
                        image_url: {
                            url: item.image,
                            detail: 'auto' as const,
                        },
                    };
                }
                return { type: 'text' as const, text: item.text };
            });

            if (msg.role === 'user') {
                openaiMessages.push({
                    role: 'user',
                    content: contentParts,
                });
            } else {
                // Assistant messages with array content - convert to string
                const textContent = contentParts
                    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                    .map(p => p.text)
                    .join('');
                openaiMessages.push({
                    role: 'assistant',
                    content: textContent,
                });
            }
        }
    }

    return openaiMessages;
}

/**
 * Convert provider Message format to OpenAI Responses API input format.
 *
 * The Responses API uses a different input format than chat.completions.
 *
 * @param messages - Array of provider messages
 * @returns Array of Responses API input items
 */
function convertToResponsesInput(
    messages: StreamOptions['messages']
): Array<{ role: 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image_url?: string }> }> {
    const input: Array<{ role: 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image_url?: string }> }> = [];

    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            input.push({
                role: msg.role,
                content: msg.content,
            });
        } else {
            // Array content with possible images
            const contentParts = msg.content.map(item => {
                if (item.type === 'image') {
                    return {
                        type: 'input_image',
                        image_url: item.image,
                    };
                }
                return { type: 'input_text', text: item.text };
            });

            input.push({
                role: msg.role,
                content: contentParts,
            });
        }
    }

    return input;
}

/**
 * Check if a model is a GPT-5 or reasoning model (o1, o3, etc.)
 * These models have different API requirements.
 */
function isReasoningModel(modelId: string): boolean {
    return modelId.startsWith('gpt-5') || modelId.startsWith('o1') || modelId.startsWith('o3');
}

/**
 * Stream agent actions using the OpenAI Responses API.
 *
 * The Responses API provides server-side conversation state persistence
 * through the previous_response_id parameter.
 *
 * @param client - OpenAI client instance
 * @param options - Streaming configuration options
 * @yields StreamAction objects as they are parsed from the response
 */
async function* streamWithResponsesAPI(
    client: OpenAI,
    options: StreamOptions
): AsyncGenerator<StreamAction> {
    const { modelId, messages, systemPrompt, maxTokens, temperature = 0, signal, previousResponseId } = options;

    debugSession('START', 'Using Responses API', { previousResponseId, modelId });

    // Build the system prompt with JSON instruction
    const jsonSystemPrompt = `${systemPrompt}

IMPORTANT: You MUST respond with a valid JSON object containing an "actions" array. Each action in the array must have a "_type" field indicating the action type. Example format:
{"actions": [{"_type": "message", "content": "Hello!"}, {"_type": "createShape", "shape": {...}}]}`;

    // Convert messages to Responses API format
    const input = convertToResponsesInput(messages);

    // Check abort before starting
    if (signal?.aborted) {
        throw new Error('Cancelled by user');
    }

    // Build request options for Responses API
    // We need to use explicit streaming params to get the correct return type
    const baseOptions = {
        model: modelId,
        input: input as unknown as Parameters<typeof client.responses.create>[0]['input'],
        instructions: jsonSystemPrompt,
        store: true, // Enable server-side state persistence
        previous_response_id: previousResponseId,
        max_output_tokens: maxTokens,
        text: {
            format: { type: 'json_object' as const }
        }
    };

    // Add temperature for non-reasoning models
    const requestOptions = isReasoningModel(modelId)
        ? { ...baseOptions, stream: true as const }
        : { ...baseOptions, stream: true as const, temperature };

    debugSession('REQUEST', 'Creating Responses API stream', {
        store: requestOptions.store,
        previousResponseId: requestOptions.previous_response_id
    });

    // Create the streaming response - cast to AsyncIterable for proper typing
    const stream = await client.responses.create(requestOptions) as AsyncIterable<ResponsesStreamEvent>;

    // Set up abort handler
    let aborted = false;
    let abortHandler: (() => void) | null = null;
    if (signal) {
        abortHandler = () => {
            debugSession('ABORT', 'Request aborted by signal');
            aborted = true;
        };
        signal.addEventListener('abort', abortHandler);
    }

    try {
        let buffer = '';
        let cursor = 0;
        let maybeIncompleteAction: { _type: string; [key: string]: unknown } | null = null;
        let startTime = Date.now();
        let responseId: string | undefined;
        let cachedTokens = 0;

        let chunkCount = 0;
        let actionCount = 0;
        debugSession('RECEIVE', 'Starting to receive Responses API stream events...');

        // Process stream events
        for await (const event of stream) {
            if (aborted || signal?.aborted) {
                debugSession('RECEIVE', 'Stream aborted, breaking loop');
                break;
            }

            chunkCount++;

            // Extract response ID and usage from created or completed events
            if (event.type === 'response.created' || event.type === 'response.completed') {
                if (event.response?.id) {
                    responseId = event.response.id;
                    debugSession('RESPONSE_ID', 'Extracted responseId', { responseId });
                }
                // Extract cached tokens from completed event usage
                const usage = (event.response as { usage?: { input_tokens_details?: { cached_tokens?: number } } })?.usage;
                if (usage?.input_tokens_details?.cached_tokens) {
                    cachedTokens = usage.input_tokens_details.cached_tokens;
                    debugSession('CACHE', `Cached tokens: ${cachedTokens}`);
                }
            }

            // Extract text content from delta events
            if (event.type === 'response.output_text.delta') {
                if (event.delta) {
                    buffer += event.delta;

                    if (chunkCount % 10 === 0) {
                        debugSession('RECEIVE', `Received ${chunkCount} events, buffer length: ${buffer.length}`);
                    }

                    // Try to parse partial JSON to extract actions
                    const partialObject = closeAndParseJson(buffer);
                    if (!partialObject) continue;

                    const actions = partialObject.actions;
                    if (!Array.isArray(actions)) continue;
                    if (actions.length === 0) continue;

                    // Process all completed actions (multiple may complete in one chunk)
                    while (actions.length > cursor) {
                        // Complete the previous action if there is one
                        const completedAction = actions[cursor - 1];
                        if (completedAction && cursor > 0) {
                            actionCount++;
                            debugSession('PROCESS', `Action ${actionCount} complete:`, completedAction._type);
                            yield {
                                ...completedAction,
                                complete: true,
                                time: Date.now() - startTime,
                            };
                            maybeIncompleteAction = null;
                            startTime = Date.now();
                        }
                        cursor++;
                    }

                    // Yield the current (potentially incomplete) action
                    const currentAction = actions[cursor - 1];
                    if (currentAction) {
                        if (!maybeIncompleteAction) {
                            startTime = Date.now();
                            debugSession('PROCESS', 'New action started:', currentAction._type);
                        }
                        maybeIncompleteAction = currentAction;
                        yield {
                            ...currentAction,
                            complete: false,
                            time: Date.now() - startTime,
                        };
                    }
                }
            }
        }

        debugSession('RECEIVE', `Stream complete. Total events: ${chunkCount}, actions: ${actionCount}, cachedTokens: ${cachedTokens}`);

        // Complete the last action if there is one, include responseId and cache metrics
        if (maybeIncompleteAction) {
            debugSession('COMPLETE', 'Completing final action', { responseId, cachedTokens });
            const finalAction: StreamAction = {
                ...maybeIncompleteAction,
                complete: true,
                time: Date.now() - startTime,
                responseId, // Include responseId in final action
            };
            // Add cache metrics if we got cached tokens
            if (cachedTokens > 0) {
                finalAction.cacheMetrics = { created: 0, read: cachedTokens };
            }
            yield finalAction;
        }
    } catch (error) {
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        // Handle rate limit errors during streaming
        if (isRateLimitError(error)) {
            const retryDelay = extractRetryDelay(error);
            const delayInfo = retryDelay ? ` (retry after ${Math.ceil(retryDelay / 1000)}s)` : '';
            throw new Error(`Rate limit exceeded${delayInfo}. Please try again later.`);
        }

        throw error;
    } finally {
        // Clean up abort handler
        if (signal && abortHandler) {
            signal.removeEventListener('abort', abortHandler);
        }
    }
}

/**
 * Stream agent actions using the OpenAI Chat Completions API.
 *
 * This is the standard API path for new conversations without session state.
 *
 * @param client - OpenAI client instance
 * @param options - Streaming configuration options
 * @yields StreamAction objects as they are parsed from the response
 */
async function* streamWithChatCompletionsAPI(
    client: OpenAI,
    options: StreamOptions
): AsyncGenerator<StreamAction> {
    const { modelId, messages, systemPrompt, maxTokens, temperature = 0, signal } = options;

    debugAgent('SEND', 'Using chat.completions API', { modelId, maxTokens, temperature, messageCount: messages.length });

    // Convert messages to OpenAI format
    const openaiMessages = convertToOpenAIMessages(messages, systemPrompt);

    // GPT-5 and reasoning models (o1, o3) have different API requirements:
    // - Use max_completion_tokens instead of max_tokens
    // - Don't support temperature parameter
    const isReasoning = isReasoningModel(modelId);

    // Check abort before starting
    if (signal?.aborted) {
        throw new Error('Cancelled by user');
    }

    // Build request options based on model capabilities
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model: modelId,
        messages: openaiMessages,
        response_format: { type: 'json_object' },
        stream: true,
        // Include usage data in stream to get cached_tokens info
        stream_options: { include_usage: true },
    };

    // Add token limit with appropriate parameter name
    if (isReasoning) {
        requestOptions.max_completion_tokens = maxTokens;
        // Reasoning models don't support temperature
    } else {
        requestOptions.max_tokens = maxTokens;
        requestOptions.temperature = temperature;
    }

    // Retry configuration for rate limits
    const maxRetries = 3;
    let lastError: unknown;
    let stream: Awaited<ReturnType<typeof client.chat.completions.create>> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        try {
            debugAgent('SEND', `Creating stream (attempt ${attempt + 1}/${maxRetries + 1})...`, { isReasoningModel: isReasoning });
            stream = await client.chat.completions.create(requestOptions);
            debugAgent('SEND', 'Stream created successfully');
            break; // Success, exit retry loop
        } catch (error) {
            lastError = error;

            if (signal?.aborted) {
                throw new Error('Cancelled by user');
            }

            if (!isRateLimitError(error) || attempt >= maxRetries) {
                throw error;
            }

            // Get retry delay from error or use exponential backoff
            let delayMs = extractRetryDelay(error) ?? Math.min(1000 * Math.pow(2, attempt), 60000);
            delayMs = Math.min(delayMs, 60000);

            debugAgent('RATE_LIMIT', `Rate limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(delayMs, signal);
        }
    }

    if (!stream) {
        throw lastError ?? new Error('Failed to create stream');
    }

    // Set up abort handler
    let aborted = false;
    let abortHandler: (() => void) | null = null;
    if (signal) {
        abortHandler = () => {
            debugAgent('ABORT', 'Request aborted by signal');
            aborted = true;
        };
        signal.addEventListener('abort', abortHandler);
    }

    try {
        let buffer = '';
        let cursor = 0;
        let maybeIncompleteAction: { _type: string; [key: string]: unknown } | null = null;
        let startTime = Date.now();

        let chunkCount = 0;
        let actionCount = 0;
        let cachedTokens = 0;
        debugAgent('RECEIVE', 'Starting to receive stream events...');

        for await (const chunk of stream) {
            if (aborted || signal?.aborted) {
                debugAgent('RECEIVE', 'Stream aborted, breaking loop');
                break;
            }

            // Extract cached tokens from usage (comes in final chunk with stream_options.include_usage)
            if (chunk.usage?.prompt_tokens_details?.cached_tokens) {
                cachedTokens = chunk.usage.prompt_tokens_details.cached_tokens;
                debugAgent('CACHE', `Cached tokens: ${cachedTokens}`);
            }

            // Extract content from delta
            const delta = chunk.choices[0]?.delta;
            if (!delta?.content) continue;

            buffer += delta.content;
            chunkCount++;

            if (chunkCount % 10 === 0) {
                debugAgent('RECEIVE', `Received ${chunkCount} chunks, buffer length: ${buffer.length}`);
            }

            // Try to parse partial JSON to extract actions
            const partialObject = closeAndParseJson(buffer);
            if (!partialObject) continue;

            const actions = partialObject.actions;
            if (!Array.isArray(actions)) continue;
            if (actions.length === 0) continue;

            // Process all completed actions (multiple may complete in one chunk)
            while (actions.length > cursor) {
                // Complete the previous action if there is one
                const completedAction = actions[cursor - 1];
                if (completedAction && cursor > 0) {
                    actionCount++;
                    debugAgent('PROCESS', `Action ${actionCount} complete:`, completedAction._type);
                    yield {
                        ...completedAction,
                        complete: true,
                        time: Date.now() - startTime,
                    };
                    maybeIncompleteAction = null;
                    startTime = Date.now();
                }
                cursor++;
            }

            // Yield the current (potentially incomplete) action
            const currentAction = actions[cursor - 1];
            if (currentAction) {
                if (!maybeIncompleteAction) {
                    startTime = Date.now();
                    debugAgent('PROCESS', 'New action started:', currentAction._type);
                }
                maybeIncompleteAction = currentAction;
                yield {
                    ...currentAction,
                    complete: false,
                    time: Date.now() - startTime,
                };
            }
        }
        debugAgent('RECEIVE', `Stream complete. Total chunks: ${chunkCount}, actions: ${actionCount}, cachedTokens: ${cachedTokens}`);

        // Complete the last action if there is one
        if (maybeIncompleteAction) {
            const finalAction: StreamAction = {
                ...maybeIncompleteAction,
                complete: true,
                time: Date.now() - startTime,
            };
            // Add cache metrics if we got cached tokens (OpenAI auto-caches prompts 1024+ tokens)
            if (cachedTokens > 0) {
                finalAction.cacheMetrics = { created: 0, read: cachedTokens };
                debugAgent('CACHE', `Cache metrics: read=${cachedTokens} tokens`);
            }
            yield finalAction;
        }
    } catch (error) {
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        // Handle rate limit errors during streaming
        if (isRateLimitError(error)) {
            const retryDelay = extractRetryDelay(error);
            const delayInfo = retryDelay ? ` (retry after ${Math.ceil(retryDelay / 1000)}s)` : '';
            throw new Error(`Rate limit exceeded${delayInfo}. Please try again later.`);
        }

        throw error;
    } finally {
        // Clean up abort handler
        if (signal && abortHandler) {
            signal.removeEventListener('abort', abortHandler);
        }
    }
}

/**
 * Stream agent actions from OpenAI.
 *
 * This is the primary method for getting structured responses from OpenAI
 * in a streaming fashion. Uses JSON mode for structured output.
 *
 * Automatically selects the appropriate API:
 * - Responses API: When previousResponseId is provided (session continuity)
 * - Chat Completions API: Default for new conversations
 *
 * @param options - Streaming configuration options
 * @yields StreamAction objects as they are parsed from the response
 */
export async function* streamAgentActions(
    options: StreamOptions
): AsyncGenerator<StreamAction> {
    const { apiKey, previousResponseId, signal } = options;

    debugAgent('SEND', 'Starting request', {
        modelId: options.modelId,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        messageCount: options.messages.length,
        hasSession: !!previousResponseId
    });

    const client = createOpenAIClient(apiKey);

    // Determine which API to use based on session state
    if (previousResponseId) {
        debugSession('API_SELECTION', 'Using Responses API for session continuity', { previousResponseId });

        try {
            // Try Responses API first when session is available
            yield* streamWithResponsesAPI(client, options);
            return;
        } catch (error) {
            // Log fallback and try chat.completions API
            debugSession('FALLBACK', 'Responses API failed, falling back to chat.completions', {
                error: error instanceof Error ? error.message : String(error)
            });

            // Check if cancelled before fallback
            if (signal?.aborted) {
                throw new Error('Cancelled by user');
            }

            // Fall through to chat.completions API
        }
    }

    // Use chat.completions API (default path or fallback)
    yield* streamWithChatCompletionsAPI(client, options);
}

/**
 * OpenAI provider implementation.
 *
 * Implements the AIProvider interface for OpenAI's GPT models,
 * providing streaming agent actions, connection testing, and error parsing.
 */
export const openaiProvider: AIProvider = {
    name: 'openai',

    createClient(apiKey: string): OpenAI {
        return createOpenAIClient(apiKey);
    },

    async *streamAgentActions(options: StreamOptions): AsyncGenerator<StreamAction> {
        yield* streamAgentActions(options);
    },

    async testConnection(apiKey: string, baseUrl?: string): Promise<ConnectionResult> {
        return testOpenAIConnection(apiKey, baseUrl);
    },

    parseError(error: unknown): AIError {
        return parseOpenAIError(error);
    },
};
