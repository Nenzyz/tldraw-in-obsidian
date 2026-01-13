/**
 * Anthropic client module - Backward compatibility layer.
 *
 * This module re-exports functionality from the new provider abstraction layer
 * to maintain backward compatibility with existing code that imports from here.
 *
 * @deprecated Import from 'src/ai/providers' or 'src/ai/providers/anthropic' instead.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
    createAnthropicClient as _createAnthropicClient,
    parseAnthropicError as _parseAnthropicError,
    testAnthropicConnection as _testAnthropicConnection,
    streamAgentActions as _streamAgentActions,
} from './providers/anthropic';
import type { FetchedModel } from './providers/types';

// Re-export types for backward compatibility
// Map the new AIError type to the old AnthropicError type format

/**
 * @deprecated Use AIErrorType from 'src/ai/providers' instead.
 */
export type AnthropicErrorType =
    | 'invalid_api_key'
    | 'rate_limit'
    | 'network_error'
    | 'server_error'
    | 'unknown';

/**
 * @deprecated Use AIError from 'src/ai/providers' instead.
 */
export interface AnthropicError {
    type: AnthropicErrorType;
    message: string;
    retryable: boolean;
}

/**
 * @deprecated Use FetchedModel from 'src/ai/providers' instead.
 */
export type { FetchedModel };

/**
 * Create an Anthropic client with the given API key.
 *
 * @deprecated Import from 'src/ai/providers/anthropic' instead.
 *
 * @param apiKey - The Anthropic API key
 * @returns Configured Anthropic client instance
 */
export function createAnthropicClient(apiKey: string): Anthropic {
    return _createAnthropicClient(apiKey);
}

/**
 * Parse an error from the Anthropic API into a structured format.
 *
 * @deprecated Import from 'src/ai/providers/anthropic' instead.
 *
 * Note: This returns the old AnthropicError format for backward compatibility.
 * The new parseAnthropicError returns AIError which includes 'provider' field.
 *
 * @param error - The error to parse
 * @returns Structured error in the old format (without provider field)
 */
export function parseAnthropicError(error: unknown): AnthropicError {
    const aiError = _parseAnthropicError(error);
    // Map context_exceeded to unknown for backward compatibility
    // (the old type didn't have context_exceeded)
    const type: AnthropicErrorType =
        aiError.type === 'context_exceeded' ? 'unknown' : (aiError.type as AnthropicErrorType);
    return {
        type,
        message: aiError.message,
        retryable: aiError.retryable,
    };
}

/**
 * Test the connection to the Anthropic API and fetch available models.
 *
 * @deprecated Import testAnthropicConnection from 'src/ai/providers/anthropic' instead.
 *
 * @param apiKey - The API key to test
 * @returns Connection result with success status and available models
 */
export async function testAnthropicConnection(apiKey: string): Promise<{
    success: boolean;
    error?: string;
    models?: FetchedModel[];
}> {
    return _testAnthropicConnection(apiKey);
}

/**
 * Cancellation token for streaming operations.
 *
 * @deprecated Use AbortController/AbortSignal instead.
 */
export class CancellationToken {
    private _cancelled = false;
    private _listeners: (() => void)[] = [];

    get isCancelled(): boolean {
        return this._cancelled;
    }

    cancel(): void {
        if (!this._cancelled) {
            this._cancelled = true;
            this._listeners.forEach(listener => listener());
        }
    }

    onCancel(listener: () => void): () => void {
        if (this._cancelled) {
            listener();
            return () => {};
        }
        this._listeners.push(listener);
        return () => {
            const index = this._listeners.indexOf(listener);
            if (index !== -1) {
                this._listeners.splice(index, 1);
            }
        };
    }
}

/**
 * Stream response handler callbacks.
 *
 * @deprecated This interface is no longer used. Use the generator-based API instead.
 */
export interface StreamCallbacks {
    onText?: (text: string) => void;
    onComplete?: (fullText: string) => void;
    onError?: (error: AnthropicError) => void;
}

/**
 * Send a streaming message to Claude.
 *
 * @deprecated Use streamAgentActions for agent functionality,
 * or use the Anthropic SDK directly for simple chat.
 *
 * This function is kept for backward compatibility but is not recommended
 * for new code. Consider using the provider abstraction layer instead.
 */
export async function streamMessage(
    apiKey: string,
    modelId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    maxTokens: number,
    callbacks: StreamCallbacks,
    cancellationToken?: CancellationToken,
): Promise<void> {
    const client = createAnthropicClient(apiKey);

    try {
        const stream = await client.messages.stream({
            model: modelId,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: messages,
        });

        let fullText = '';
        let aborted = false;

        // Handle cancellation
        if (cancellationToken) {
            cancellationToken.onCancel(() => {
                aborted = true;
                stream.abort();
            });
        }

        for await (const event of stream) {
            if (aborted) break;

            if (event.type === 'content_block_delta') {
                const delta = event.delta as { type?: string; text?: string };
                if (delta?.type === 'text_delta' && delta.text) {
                    fullText += delta.text;
                    callbacks.onText?.(delta.text);
                }
            }
        }

        if (!aborted) {
            callbacks.onComplete?.(fullText);
        }
    } catch (error) {
        // Don't report error if cancelled
        if (cancellationToken?.isCancelled) {
            return;
        }

        const parsedError = parseAnthropicError(error);
        callbacks.onError?.(parsedError);
    }
}

/**
 * Stream agent actions from Claude.
 *
 * @deprecated Import from 'src/ai/providers/anthropic' instead.
 *
 * This function is re-exported for backward compatibility.
 * The implementation now lives in the provider module.
 *
 * @param apiKey - The Anthropic API key
 * @param modelId - The model ID to use
 * @param messages - The conversation messages
 * @param systemPrompt - The system prompt
 * @param maxTokens - Maximum tokens to generate
 * @param signal - Optional abort signal for cancellation
 * @yields StreamAction objects as they are parsed from the response
 */
export async function* streamAgentActions(
    apiKey: string,
    modelId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string | Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> }>,
    systemPrompt: string,
    maxTokens: number,
    signal?: AbortSignal,
): AsyncGenerator<{ _type: string; complete: boolean; time: number; [key: string]: unknown }> {
    yield* _streamAgentActions({
        apiKey,
        modelId,
        messages,
        systemPrompt,
        maxTokens,
        signal,
    });
}

/**
 * Send a non-streaming message to Claude (for tool use).
 *
 * @deprecated Use the Anthropic SDK directly for non-streaming requests.
 *
 * This function is kept for backward compatibility.
 */
export async function sendMessage(
    apiKey: string,
    modelId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    maxTokens: number,
): Promise<{ text: string } | { error: AnthropicError }> {
    const client = createAnthropicClient(apiKey);

    try {
        const response = await client.messages.create({
            model: modelId,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: messages,
        });

        // Extract text from response
        const textContent = response.content.find(block => block.type === 'text');
        if (textContent && textContent.type === 'text') {
            return { text: textContent.text };
        }

        return { text: '' };
    } catch (error) {
        return { error: parseAnthropicError(error) };
    }
}
