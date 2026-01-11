import Anthropic from '@anthropic-ai/sdk';

/**
 * Error types for API failures
 */
export type AnthropicErrorType =
    | 'invalid_api_key'
    | 'rate_limit'
    | 'network_error'
    | 'server_error'
    | 'unknown';

export interface AnthropicError {
    type: AnthropicErrorType;
    message: string;
    retryable: boolean;
}

/**
 * Create an Anthropic client with the given API key
 * Note: This uses dangerouslyAllowBrowser since we're running in Obsidian
 */
export function createAnthropicClient(apiKey: string): Anthropic {
    return new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
    });
}

/**
 * Parse an error from the Anthropic API into a structured format
 */
export function parseAnthropicError(error: unknown): AnthropicError {
    if (error instanceof Anthropic.APIError) {
        if (error.status === 401) {
            return {
                type: 'invalid_api_key',
                message: 'Invalid API key. Please check your API key in settings.',
                retryable: false,
            };
        }
        if (error.status === 429) {
            return {
                type: 'rate_limit',
                message: 'Rate limit exceeded. Please wait and try again.',
                retryable: true,
            };
        }
        if (error.status >= 500) {
            return {
                type: 'server_error',
                message: 'Anthropic server error. Please try again later.',
                retryable: true,
            };
        }
    }

    if (error instanceof Error) {
        if (error.message.includes('network') || error.message.includes('fetch')) {
            return {
                type: 'network_error',
                message: 'Network error. Please check your internet connection.',
                retryable: true,
            };
        }
    }

    return {
        type: 'unknown',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        retryable: false,
    };
}

/**
 * Fetched model information
 */
export interface FetchedModel {
    id: string;
    displayName: string;
}

/**
 * Test the connection to the Anthropic API and fetch available models
 */
export async function testAnthropicConnection(apiKey: string): Promise<{
    success: boolean;
    error?: string;
    models?: FetchedModel[];
}> {
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
 * Format a model ID into a human-readable name
 */
function formatModelName(modelId: string): string {
    // Convert "claude-3-5-sonnet-20241022" to "Claude 3.5 Sonnet"
    // Convert "claude-sonnet-4-20250514" to "Claude Sonnet 4"
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
 * Cancellation token for streaming operations
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
 * Stream response handler
 */
export interface StreamCallbacks {
    onText?: (text: string) => void;
    onComplete?: (fullText: string) => void;
    onError?: (error: AnthropicError) => void;
}

/**
 * Send a streaming message to Claude
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

            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                const text = event.delta.text;
                fullText += text;
                callbacks.onText?.(text);
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
 * Send a non-streaming message to Claude (for tool use)
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
