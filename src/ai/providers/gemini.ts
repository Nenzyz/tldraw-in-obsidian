/**
 * Google Gemini provider implementation.
 *
 * This module implements the AIProvider interface for Google's Gemini models.
 * It provides streaming agent actions with JSON response format for structured output.
 */

import {
    GoogleGenerativeAI,
    GoogleGenerativeAIFetchError,
    SchemaType,
    type Content,
    type Part,
    type GenerativeModel,
    type InlineDataPart,
    type TextPart,
} from '@google/generative-ai';
import type {
    AIProvider,
    AIError,
    ConnectionResult,
    FetchedModel,
    StreamOptions,
    StreamAction,
} from './types';
import { isRateLimitError, extractRetryDelay, sleep } from './rate-limit';

// Debug logging for agent flow
const DEBUG_AGENT = true;
function debugAgent(stage: string, ...args: unknown[]) {
    if (DEBUG_AGENT) {
        console.warn(`[Gemini:${stage}]`, ...args);
    }
}

/**
 * Create a Google Generative AI client with the given API key.
 *
 * @param apiKey - The Google AI API key
 * @returns Configured GoogleGenerativeAI client instance
 */
export function createGeminiClient(apiKey: string): GoogleGenerativeAI {
    return new GoogleGenerativeAI(apiKey);
}

/**
 * Parse an error from the Gemini API into a structured AIError format.
 *
 * Maps Gemini SDK-specific errors to the common AIError type for
 * consistent error handling across all providers.
 *
 * @param error - The error to parse (from Gemini SDK)
 * @returns Normalized AIError structure
 */
export function parseGeminiError(error: unknown): AIError {
    // Handle GoogleGenerativeAIFetchError with status codes
    if (error instanceof GoogleGenerativeAIFetchError) {
        const status = error.status;

        if (status === 401 || status === 403) {
            // Check for quota/rate limit in error details
            const isRateLimit = error.errorDetails?.some(
                d => d.reason === 'RATE_LIMIT_EXCEEDED' || d.reason === 'RESOURCE_EXHAUSTED'
            );

            if (isRateLimit) {
                return {
                    type: 'rate_limit',
                    message: 'Rate limit exceeded. Please wait and try again.',
                    retryable: true,
                    provider: 'google',
                };
            }

            return {
                type: 'invalid_api_key',
                message: 'Invalid API key. Please check your Google AI API key in settings.',
                retryable: false,
                provider: 'google',
            };
        }

        if (status === 429) {
            return {
                type: 'rate_limit',
                message: 'Rate limit exceeded. Please wait and try again.',
                retryable: true,
                provider: 'google',
            };
        }

        if (status && status >= 500) {
            return {
                type: 'server_error',
                message: 'Google AI server error. Please try again later.',
                retryable: true,
                provider: 'google',
            };
        }
    }

    // Handle Error objects
    if (error instanceof Error) {
        // Detect context/payload size exceeded errors
        if (
            error.message.includes('payload size') ||
            error.message.includes('too many tokens') ||
            error.message.includes('context length') ||
            error.message.includes('maximum')
        ) {
            return {
                type: 'context_exceeded',
                message: 'The conversation is too long. Please start a new conversation or clear some history.',
                retryable: false,
                provider: 'google',
            };
        }

        // Detect network errors
        if (
            error.message.includes('network') ||
            error.message.includes('fetch') ||
            error.message.includes('ECONNREFUSED')
        ) {
            return {
                type: 'network_error',
                message: 'Network error. Please check your internet connection.',
                retryable: true,
                provider: 'google',
            };
        }

        // Unknown error with message
        return {
            type: 'unknown',
            message: error.message,
            retryable: false,
            provider: 'google',
        };
    }

    // Fallback for non-Error objects
    return {
        type: 'unknown',
        message: 'An unknown error occurred',
        retryable: false,
        provider: 'google',
    };
}

/**
 * Format a model name into a human-readable display name.
 *
 * @param modelName - The raw model name from the API (e.g., "models/gemini-2.5-flash")
 * @returns Human-readable display name
 *
 * @example
 * formatModelName('models/gemini-2.5-flash') // 'Gemini 2.5 Flash'
 * formatModelName('models/gemini-2.5-pro') // 'Gemini 2.5 Pro'
 */
function formatModelName(modelName: string): string {
    // Remove "models/" prefix if present
    const baseName = modelName.replace(/^models\//, '');

    return baseName
        .split('-')
        .map(part => {
            if (part === 'gemini') return 'Gemini';
            if (/^\d+(\.\d+)?$/.test(part)) return part;
            return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join(' ');
}

/**
 * Test the connection to the Google AI API and fetch available models.
 *
 * @param apiKey - The API key to test
 * @returns Connection result with success status and available models
 */
export async function testGeminiConnection(apiKey: string, _baseUrl?: string): Promise<ConnectionResult> {
    if (!apiKey || !apiKey.trim()) {
        return { success: false, error: 'API key is required' };
    }

    try {
        // Use the REST API directly to list models since the SDK doesn't have listModels
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return { success: false, error: 'Invalid API key. Please check your Google AI API key.' };
            }
            return { success: false, error: `API error: ${response.statusText}` };
        }

        const data = await response.json();

        // Filter to only Gemini models and format them
        const models: FetchedModel[] = (data.models || [])
            .filter((model: { name: string }) =>
                model.name.toLowerCase().includes('gemini')
            )
            .map((model: { name: string; displayName?: string }) => ({
                id: model.name.replace(/^models\//, ''),
                displayName: model.displayName || formatModelName(model.name),
            }))
            .sort((a: FetchedModel, b: FetchedModel) => a.displayName.localeCompare(b.displayName));

        return { success: true, models };
    } catch (error) {
        const parsedError = parseGeminiError(error);
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
 * Convert messages to Gemini format.
 *
 * @param messages - Messages in our unified format
 * @returns Messages in Gemini Content format
 */
function convertMessagesToGeminiFormat(
    messages: StreamOptions['messages']
): Content[] {
    return messages.map(msg => {
        // Map role: 'assistant' -> 'model' for Gemini
        const role = msg.role === 'assistant' ? 'model' : 'user';

        if (typeof msg.content === 'string') {
            return {
                role,
                parts: [{ text: msg.content } as TextPart],
            };
        }

        // Handle array content with images
        const parts: Part[] = msg.content.map(item => {
            if (item.type === 'image') {
                // Extract base64 data and mime type from data URL
                const match = item.image.match(/^data:(image\/\w+);base64,(.+)$/);
                if (match) {
                    const mimeType = match[1];
                    const data = match[2];
                    return {
                        inlineData: {
                            mimeType,
                            data,
                        },
                    } as InlineDataPart;
                }
                // Fallback: treat as raw base64 with default mime type
                return {
                    inlineData: {
                        mimeType: 'image/png',
                        data: item.image,
                    },
                } as InlineDataPart;
            }
            return { text: item.text } as TextPart;
        });

        return { role, parts };
    });
}

/**
 * Stream agent actions from Gemini.
 *
 * This is the primary method for getting structured responses from Gemini
 * in a streaming fashion. Uses JSON response format for structured output.
 *
 * @param options - Streaming configuration options
 * @yields StreamAction objects as they are parsed from the response
 */
export async function* streamGeminiAgentActions(
    options: StreamOptions
): AsyncGenerator<StreamAction> {
    const { apiKey, modelId, messages, systemPrompt, maxTokens, temperature = 0, signal } = options;

    debugAgent('SEND', 'Starting request', { modelId, maxTokens, temperature, messageCount: messages.length });
    const client = createGeminiClient(apiKey);

    // Create the generative model with configuration
    const model: GenerativeModel = client.getGenerativeModel({
        model: modelId,
        generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    actions: {
                        type: SchemaType.ARRAY,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                _type: {
                                    type: SchemaType.STRING,
                                    description: 'The type of action',
                                },
                            },
                            required: ['_type'],
                        },
                    },
                },
                required: ['actions'],
            },
        },
        systemInstruction: systemPrompt,
    });

    // Convert messages to Gemini format
    const geminiContents = convertMessagesToGeminiFormat(messages);

    // Check abort before starting
    if (signal?.aborted) {
        throw new Error('Cancelled by user');
    }

    // Retry configuration for rate limits
    const maxRetries = 3;
    let lastError: unknown;
    let streamResult: Awaited<ReturnType<typeof model.generateContentStream>> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        try {
            debugAgent('SEND', `Creating stream (attempt ${attempt + 1}/${maxRetries + 1})...`);
            streamResult = await model.generateContentStream(
                { contents: geminiContents },
                { signal }
            );
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

    if (!streamResult) {
        throw lastError ?? new Error('Failed to create stream');
    }

    try {
        let buffer = '';
        let cursor = 0;
        let maybeIncompleteAction: { _type: string; [key: string]: unknown } | null = null;
        let startTime = Date.now();

        let chunkCount = 0;
        let actionCount = 0;
        debugAgent('RECEIVE', 'Starting to receive stream events...');

        for await (const chunk of streamResult.stream) {
            if (signal?.aborted) {
                debugAgent('RECEIVE', 'Stream aborted, breaking loop');
                break;
            }

            // Extract text from chunk, filtering out thinking tokens
            const candidates = chunk.candidates;
            if (!candidates || candidates.length === 0) continue;

            const content = candidates[0].content;
            if (!content || !content.parts) continue;

            // Filter out thinking tokens (parts with thought: true)
            for (const part of content.parts) {
                // Skip thinking tokens - check for thought property
                // The thought property exists on thinking tokens but is not in the type definition
                const partWithThought = part as Part & { thought?: boolean };
                if (partWithThought.thought === true) {
                    debugAgent('RECEIVE', 'Skipping thinking token');
                    continue;
                }

                // Get text from part - only TextPart has text
                const textPart = part as TextPart;
                const text = textPart.text;
                if (!text) continue;

                buffer += text;
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
            yield {
                ...maybeIncompleteAction,
                complete: true,
                time: Date.now() - startTime,
            };
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
    }
}

/**
 * Google Gemini provider implementation.
 *
 * Implements the AIProvider interface for Google's Gemini models,
 * providing streaming agent actions, connection testing, and error parsing.
 */
export const geminiProvider: AIProvider = {
    name: 'google',

    createClient(apiKey: string): GoogleGenerativeAI {
        return createGeminiClient(apiKey);
    },

    async *streamAgentActions(options: StreamOptions): AsyncGenerator<StreamAction> {
        yield* streamGeminiAgentActions(options);
    },

    async testConnection(apiKey: string, baseUrl?: string): Promise<ConnectionResult> {
        return testGeminiConnection(apiKey, baseUrl);
    },

    parseError(error: unknown): AIError {
        return parseGeminiError(error);
    },
};
