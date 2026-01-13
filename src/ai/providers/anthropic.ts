/**
 * Anthropic (Claude) provider implementation.
 *
 * This module implements the AIProvider interface for Anthropic's Claude models.
 * It provides streaming agent actions with JSON prefill technique for structured output.
 * Includes prompt caching support for reduced latency and costs.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
    AIProvider,
    AIError,
    ConnectionResult,
    FetchedModel,
    StreamOptions,
    StreamAction,
    CacheMetrics,
} from './types';
import { isRateLimitError, extractRetryDelay, sleep } from './rate-limit';

// Debug logging for agent flow
const DEBUG_AGENT = true;
function debugAgent(stage: string, ...args: unknown[]) {
    if (DEBUG_AGENT) {
        console.warn(`[Anthropic:${stage}]`, ...args);
    }
}

// Debug logging for cache operations - toggle independent of DEBUG_AGENT
const DEBUG_CACHE = true;
function debugCache(stage: string, ...args: unknown[]) {
    if (DEBUG_CACHE) {
        console.warn(`[Anthropic:CACHE:${stage}]`, ...args);
    }
}

/**
 * Create an Anthropic client with the given API key.
 *
 * Note: Uses dangerouslyAllowBrowser since we're running in Obsidian's
 * Electron environment which is technically a browser context.
 *
 * @param apiKey - The Anthropic API key
 * @returns Configured Anthropic client instance
 */
export function createAnthropicClient(apiKey: string): Anthropic {
    return new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
    });
}

/**
 * Parse an error from the Anthropic API into a structured AIError format.
 *
 * Maps Anthropic SDK-specific errors to the common AIError type for
 * consistent error handling across all providers.
 *
 * @param error - The error to parse (from Anthropic SDK)
 * @returns Normalized AIError structure
 */
export function parseAnthropicError(error: unknown): AIError {
    // Handle Anthropic API errors with status codes
    if (error instanceof Anthropic.APIError) {
        if (error.status === 401) {
            return {
                type: 'invalid_api_key',
                message: 'Invalid API key. Please check your API key in settings.',
                retryable: false,
                provider: 'anthropic',
            };
        }
        if (error.status === 429) {
            return {
                type: 'rate_limit',
                message: 'Rate limit exceeded. Please wait and try again.',
                retryable: true,
                provider: 'anthropic',
            };
        }
        if (error.status >= 500) {
            return {
                type: 'server_error',
                message: 'Anthropic server error. Please try again later.',
                retryable: true,
                provider: 'anthropic',
            };
        }
    }

    // Handle Error objects
    if (error instanceof Error) {
        // Detect context length exceeded errors
        if (
            error.message.includes('context_length') ||
            error.message.includes('maximum context') ||
            error.message.includes('too many tokens')
        ) {
            return {
                type: 'context_exceeded',
                message: 'The conversation is too long. Please start a new conversation or clear some history.',
                retryable: false,
                provider: 'anthropic',
            };
        }

        // Detect network errors
        if (error.message.includes('network') || error.message.includes('fetch')) {
            return {
                type: 'network_error',
                message: 'Network error. Please check your internet connection.',
                retryable: true,
                provider: 'anthropic',
            };
        }

        // Unknown error with message
        return {
            type: 'unknown',
            message: error.message,
            retryable: false,
            provider: 'anthropic',
        };
    }

    // Fallback for non-Error objects
    return {
        type: 'unknown',
        message: 'An unknown error occurred',
        retryable: false,
        provider: 'anthropic',
    };
}

/**
 * Check if an error is related to cache_control being unsupported.
 *
 * @param error - The error to check
 * @returns true if the error is cache-related
 */
function isCacheError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('cache_control') ||
               message.includes('cache control') ||
               message.includes('caching');
    }
    return false;
}

/**
 * Format a model ID into a human-readable name.
 *
 * @param modelId - The raw model ID from the API
 * @returns Human-readable display name
 *
 * @example
 * formatModelName('claude-3-5-sonnet-20241022') // 'Claude 3.5 Sonnet'
 * formatModelName('claude-sonnet-4-20250514') // 'Claude Sonnet 4'
 */
function formatModelName(modelId: string): string {
    return modelId
        .replace(/-\d{8}$/, '') // Remove date suffix
        .split('-')
        .map(part => {
            if (part === 'claude') return 'Claude';
            if (/^\d+$/.test(part)) return part;
            return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join(' ')
        .replace(/(\d) (\d)/g, '$1.$2'); // "3 5" -> "3.5"
}

/**
 * Test the connection to the Anthropic API and fetch available models.
 *
 * @param apiKey - The API key to test
 * @returns Connection result with success status and available models
 */
export async function testAnthropicConnection(apiKey: string): Promise<ConnectionResult> {
    if (!apiKey || !apiKey.trim()) {
        return { success: false, error: 'API key is required' };
    }

    try {
        const client = createAnthropicClient(apiKey);

        // Fetch available models
        const modelsResponse = await client.models.list();

        // Filter to only Claude models and format them
        const models: FetchedModel[] = modelsResponse.data
            .filter(model => model.id.startsWith('claude'))
            .map(model => ({
                id: model.id,
                displayName: formatModelName(model.id),
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));

        return { success: true, models };
    } catch (error) {
        const parsedError = parseAnthropicError(error);
        return { success: false, error: parsedError.message };
    }
}

/**
 * Try to close and parse incomplete JSON.
 *
 * This function attempts to close any unclosed brackets, braces, or strings
 * in a partial JSON buffer and parse it. Used for incremental parsing of
 * streaming responses.
 *
 * @param buffer - The partial JSON buffer
 * @returns Parsed object with actions array, or null if parsing fails
 */
export function closeAndParseJson(buffer: string): { actions: Array<{ _type: string; [key: string]: unknown }> } | null {
    let closedBuffer = buffer;

    // Count open brackets/braces
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escapeNext = false;

    for (const char of closedBuffer) {
        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (char === '\\') {
            escapeNext = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
        if (char === '[') openBrackets++;
        if (char === ']') openBrackets--;
    }

    // Close the JSON
    // If we're in a string, close it
    if (inString) {
        closedBuffer += '"';
    }

    // Close any open braces and brackets
    for (let i = 0; i < openBraces; i++) {
        closedBuffer += '}';
    }
    for (let i = 0; i < openBrackets; i++) {
        closedBuffer += ']';
    }

    try {
        return JSON.parse(closedBuffer);
    } catch {
        return null;
    }
}

/**
 * Content block type for system prompt with cache control.
 */
type SystemContentBlock = {
    type: 'text';
    text: string;
    cache_control?: { type: 'ephemeral' };
};

/**
 * Message content block type with optional cache control.
 */
type MessageContentBlockWithCache =
    | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string }; cache_control?: { type: 'ephemeral' } };

/**
 * Minimum content length (in characters) to apply cache_control to user messages.
 * Messages shorter than this won't benefit from caching.
 */
const MIN_CACHE_CONTENT_LENGTH = 100;

/**
 * Maximum number of early user messages to mark with cache breakpoints.
 */
const MAX_CACHE_BREAKPOINTS = 3;

/**
 * Build system prompt parameter for the API call.
 * When caching is enabled, returns content block array with cache_control.
 * When disabled, returns plain string.
 *
 * @param systemPrompt - The system prompt text
 * @param enableCaching - Whether caching is enabled
 * @returns System parameter for API call
 */
function buildSystemParam(
    systemPrompt: string,
    enableCaching: boolean
): string | SystemContentBlock[] {
    if (!enableCaching) {
        return systemPrompt;
    }

    debugCache('SYSTEM', 'Adding cache_control to system prompt');
    return [{
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' }
    }];
}

/**
 * Add cache_control to early user messages for multi-turn caching benefit.
 * Only applies to the first few user messages with substantial content.
 *
 * @param messages - Array of messages to process
 * @param enableCaching - Whether caching is enabled
 * @returns Messages with cache_control added to eligible user messages
 */
function addCacheBreakpointsToMessages(
    messages: Array<{
        role: 'user' | 'assistant';
        content: string | MessageContentBlockWithCache[];
    }>,
    enableCaching: boolean
): Array<{
    role: 'user' | 'assistant';
    content: string | MessageContentBlockWithCache[];
}> {
    if (!enableCaching) {
        return messages;
    }

    let breakpointsAdded = 0;

    return messages.map((msg, index) => {
        // Only add cache breakpoints to user messages
        if (msg.role !== 'user') {
            return msg;
        }

        // Stop adding breakpoints after reaching max
        if (breakpointsAdded >= MAX_CACHE_BREAKPOINTS) {
            return msg;
        }

        // Check content length for caching eligibility
        const contentLength = typeof msg.content === 'string'
            ? msg.content.length
            : msg.content.reduce((sum, block) => {
                if (block.type === 'text') {
                    return sum + block.text.length;
                }
                return sum + 100; // Images count as substantial content
            }, 0);

        if (contentLength < MIN_CACHE_CONTENT_LENGTH) {
            return msg;
        }

        breakpointsAdded++;
        debugCache('BREAKPOINT', `Adding cache breakpoint to user message ${index + 1}`);

        // Convert string content to content block array with cache_control
        if (typeof msg.content === 'string') {
            return {
                role: msg.role,
                content: [{
                    type: 'text' as const,
                    text: msg.content,
                    cache_control: { type: 'ephemeral' as const }
                }]
            };
        }

        // Add cache_control to the last content block
        const contentWithCache = msg.content.map((block, blockIndex) => {
            if (blockIndex === msg.content.length - 1) {
                return { ...block, cache_control: { type: 'ephemeral' as const } };
            }
            return block;
        });

        return {
            role: msg.role,
            content: contentWithCache
        };
    });
}

/**
 * Extract cache metrics from streaming response usage data.
 *
 * @param usage - Usage object from message_start event
 * @returns CacheMetrics if cache data is available, undefined otherwise
 */
function extractCacheMetrics(usage: {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
} | undefined): CacheMetrics | undefined {
    if (!usage) {
        return undefined;
    }

    const created = usage.cache_creation_input_tokens;
    const read = usage.cache_read_input_tokens;

    // Only return metrics if at least one cache field is present
    if (created === undefined && read === undefined) {
        return undefined;
    }

    const metrics: CacheMetrics = {
        created: created ?? 0,
        read: read ?? 0
    };

    // Log cache metrics and hit ratio
    const total = metrics.created + metrics.read;
    if (total > 0) {
        const hitRatio = metrics.read / total;
        debugCache('METRICS', `Created: ${metrics.created}, Read: ${metrics.read}, Hit ratio: ${(hitRatio * 100).toFixed(1)}%`);
    } else {
        debugCache('METRICS', 'No cache tokens used');
    }

    return metrics;
}

/**
 * Stream agent actions from Claude.
 *
 * This is the primary method for getting structured responses from Claude
 * in a streaming fashion. Uses the JSON prefill technique to ensure the
 * response starts with the expected format.
 *
 * Supports prompt caching via cache_control on system prompt and early user messages.
 *
 * @param options - Streaming configuration options
 * @yields StreamAction objects as they are parsed from the response
 */
export async function* streamAgentActions(
    options: StreamOptions
): AsyncGenerator<StreamAction> {
    const { apiKey, modelId, messages, systemPrompt, maxTokens, temperature = 0, signal } = options;
    // Default enableCaching to true if not specified
    const enableCaching = options.enableCaching !== false;

    debugAgent('SEND', 'Starting request', { modelId, maxTokens, temperature, messageCount: messages.length, caching: enableCaching });
    const client = createAnthropicClient(apiKey);

    // Convert messages to Anthropic format, handling both string and array content
    let anthropicMessages = messages.map(msg => {
        if (typeof msg.content === 'string') {
            return { role: msg.role, content: msg.content };
        }
        // Convert array content with images
        return {
            role: msg.role,
            content: msg.content.map(item => {
                if (item.type === 'image') {
                    // Handle base64 image
                    const imageData = item.image.replace(/^data:image\/\w+;base64,/, '');
                    const mediaType = item.image.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';
                    return {
                        type: 'image' as const,
                        source: {
                            type: 'base64' as const,
                            media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                            data: imageData,
                        },
                    };
                }
                return { type: 'text' as const, text: item.text };
            }),
        };
    }) as Array<{
        role: 'user' | 'assistant';
        content: string | MessageContentBlockWithCache[];
    }>;

    // Add cache breakpoints to early user messages when caching is enabled
    anthropicMessages = addCacheBreakpointsToMessages(anthropicMessages, enableCaching);

    // Add the prefill to force JSON response format
    // This technique ensures Claude starts its response with valid JSON
    const prefill = '{"actions": [{"_type":';
    anthropicMessages.push({
        role: 'assistant',
        content: prefill,
    });

    // Check abort before starting
    if (signal?.aborted) {
        throw new Error('Cancelled by user');
    }

    // Build system parameter (with or without cache_control)
    let systemParam = buildSystemParam(systemPrompt, enableCaching);
    let cachingEnabled = enableCaching;

    // Retry configuration for rate limits and cache fallback
    const maxRetries = 3;
    let lastError: unknown;
    let stream: ReturnType<typeof client.messages.stream> | null = null;
    let cacheMetrics: CacheMetrics | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        try {
            debugAgent('SEND', `Creating stream (attempt ${attempt + 1}/${maxRetries + 1})...`);
            stream = client.messages.stream({
                model: modelId,
                max_tokens: maxTokens,
                system: systemParam,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                messages: anthropicMessages as any,
                temperature,
            });
            debugAgent('SEND', 'Stream created successfully');
            break; // Success, exit retry loop
        } catch (error) {
            lastError = error;

            if (signal?.aborted) {
                throw new Error('Cancelled by user');
            }

            // Handle cache-specific errors - retry without caching
            if (isCacheError(error) && cachingEnabled) {
                debugCache('FALLBACK', 'Cache control caused error, retrying without caching', error);
                cachingEnabled = false;
                systemParam = systemPrompt; // Revert to plain string
                // Remove cache breakpoints from messages
                anthropicMessages = anthropicMessages.map(msg => {
                    if (typeof msg.content === 'string') {
                        return msg;
                    }
                    return {
                        role: msg.role,
                        content: msg.content.map(block => {
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            const { cache_control, ...rest } = block as MessageContentBlockWithCache & { cache_control?: unknown };
                            return rest;
                        })
                    };
                });
                // Don't increment attempt for cache fallback - give it a fresh start
                continue;
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
    let abortHandler: (() => void) | null = null;
    if (signal) {
        abortHandler = () => {
            debugAgent('ABORT', 'Request aborted by signal');
            stream?.abort();
        };
        signal.addEventListener('abort', abortHandler);
    }

    try {

        let buffer = prefill;
        let cursor = 0;
        let maybeIncompleteAction: { _type: string; [key: string]: unknown } | null = null;
        let startTime = Date.now();

        let chunkCount = 0;
        let actionCount = 0;
        debugAgent('RECEIVE', 'Starting to receive stream events...');

        for await (const event of stream) {
            if (signal?.aborted) {
                debugAgent('RECEIVE', 'Stream aborted, breaking loop');
                break;
            }

            // Handle message_start event to extract cache metrics
            if (event.type === 'message_start') {
                const messageEvent = event as {
                    type: 'message_start';
                    message?: {
                        usage?: {
                            cache_creation_input_tokens?: number;
                            cache_read_input_tokens?: number;
                            input_tokens?: number;
                            output_tokens?: number;
                        };
                    };
                };
                cacheMetrics = extractCacheMetrics(messageEvent.message?.usage);
            }

            // Handle content_block_delta events with text
            if (event.type === 'content_block_delta') {
                const delta = event.delta as { type?: string; text?: string };
                if (delta?.type !== 'text_delta' || !delta.text) continue;
                buffer += delta.text;
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
        }
        debugAgent('RECEIVE', `Stream complete. Total chunks: ${chunkCount}, actions: ${actionCount}`);

        // Complete the last action if there is one
        if (maybeIncompleteAction) {
            // Include cache metrics in the final action
            const finalAction: StreamAction = {
                ...maybeIncompleteAction,
                complete: true,
                time: Date.now() - startTime,
            };

            // Only add cacheMetrics if they were extracted
            if (cacheMetrics) {
                finalAction.cacheMetrics = cacheMetrics;
            }

            yield finalAction;
        }
    } catch (error) {
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        // Handle rate limit errors during streaming (mid-stream rate limits)
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
 * Anthropic provider implementation.
 *
 * Implements the AIProvider interface for Anthropic's Claude models,
 * providing streaming agent actions, connection testing, and error parsing.
 */
export const anthropicProvider: AIProvider = {
    name: 'anthropic',

    createClient(apiKey: string): Anthropic {
        return createAnthropicClient(apiKey);
    },

    async *streamAgentActions(options: StreamOptions): AsyncGenerator<StreamAction> {
        yield* streamAgentActions(options);
    },

    async testConnection(apiKey: string): Promise<ConnectionResult> {
        return testAnthropicConnection(apiKey);
    },

    parseError(error: unknown): AIError {
        return parseAnthropicError(error);
    },
};
