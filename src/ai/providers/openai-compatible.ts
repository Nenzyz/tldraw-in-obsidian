/**
 * OpenAI-compatible provider implementation.
 *
 * Supports local/self-hosted OpenAI-compatible endpoints like Ollama.
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

const DEFAULT_BASE_URL = 'http://localhost:11434/v1';
const DEFAULT_TIMEOUT = 60000;

const DEBUG_AGENT = true;
function debugAgent(stage: string, ...args: unknown[]) {
    if (DEBUG_AGENT) {
        console.warn(`[OpenAI-Compatible:${stage}]`, ...args);
    }
}

export function createOpenAICompatibleClient(apiKey: string, baseUrl?: string): OpenAI {
    const normalizedApiKey = apiKey?.trim() ? apiKey : 'ollama';
    const normalizedBaseUrl = baseUrl?.trim() ? baseUrl.trim() : DEFAULT_BASE_URL;

    return new OpenAI({
        apiKey: normalizedApiKey,
        baseURL: normalizedBaseUrl,
        dangerouslyAllowBrowser: true,
        timeout: DEFAULT_TIMEOUT,
    });
}

function isValidEndpoint(baseUrl: string): boolean {
    try {
        // eslint-disable-next-line no-new
        new URL(baseUrl);
        return true;
    } catch {
        return false;
    }
}

function formatModelName(modelId: string): string {
    return modelId;
}

const ACTION_PREFIX = /\[ACTION\]\s*:\s*/;

/**
 * Parses actions from text in either format:
 * - JSON object: {"actions": [{...}, {...}]}
 * - Line-based: [ACTION]: {...}
 */
function parseActions(text: string): Array<{ _type: string; [key: string]: unknown }> {
    try {
        const parsed = closeAndParseJson(text);
        if (parsed && typeof parsed === 'object' && 'actions' in parsed && Array.isArray(parsed.actions)) {
            return parsed.actions.filter(
                (a: unknown): a is { _type: string; [key: string]: unknown } =>
                    a !== null && typeof a === 'object' && '_type' in a
            );
        }
    } catch {
        // JSON object parse failed, try line-based
    }

    const actions: Array<{ _type: string; [key: string]: unknown }> = [];
    const parts = text.split(ACTION_PREFIX);

    for (let i = 1; i < parts.length; i++) {
        const jsonStr = parts[i].trim();
        if (!jsonStr) continue;
        try {
            const parsed = closeAndParseJson(jsonStr);
            if (parsed && typeof parsed === 'object' && '_type' in parsed) {
                actions.push(parsed as { _type: string; [key: string]: unknown });
            }
        } catch {
            // Partial JSON, still accumulating
        }
    }
    return actions;
}

function stripCodeFence(text: string): string {
    let stripped = text.trim();
    // Strip leading ```json or ```
    stripped = stripped.replace(/^```(?:json)?\s*\n?/, '');
    // Strip trailing ```
    stripped = stripped.replace(/\n?```\s*$/, '');
    return stripped.trim();
}

function formatConnectionError(error: unknown): string {
    if (error instanceof OpenAI.APIError) {
        if (error.status === 401 || error.status === 403) {
            return 'Invalid API key. Please check your API key in settings.';
        }
        if (error.status === 404) {
            return 'Invalid endpoint URL';
        }
        if (error.status >= 500) {
            return 'Server error. Please try again later.';
        }
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('timeout') || message.includes('timed out')) {
            return 'Connection timed out. Is Ollama running?';
        }
        if (message.includes('invalid url') || message.includes('invalid uri')) {
            return 'Invalid endpoint URL';
        }
        if (message.includes('network') || message.includes('fetch') || message.includes('econnrefused')) {
            return 'Cannot reach endpoint. Check if server is running.';
        }
        if (message.includes('failed to fetch')) {
            return 'Cannot reach endpoint. Check if server is running.';
        }
        return error.message;
    }

    return 'Connection failed. Please check your endpoint settings.';
}

export async function testOpenAICompatibleConnection(
    apiKey: string,
    baseUrl?: string
): Promise<ConnectionResult> {
    const normalizedBaseUrl = baseUrl?.trim() ? baseUrl.trim() : DEFAULT_BASE_URL;

    if (!isValidEndpoint(normalizedBaseUrl)) {
        return { success: false, error: 'Invalid endpoint URL' };
    }

    try {
        const client = createOpenAICompatibleClient(apiKey, normalizedBaseUrl);
        const modelsResponse = await client.models.list();

        const models: FetchedModel[] = [];
        for await (const model of modelsResponse) {
            if (!model.id) continue;
            models.push({
                id: model.id,
                displayName: formatModelName(model.id),
            });
        }

        models.sort((a, b) => a.displayName.localeCompare(b.displayName));

        return { success: true, models };
    } catch (error) {
        return { success: false, error: formatConnectionError(error) };
    }
}

export function parseOpenAICompatibleError(error: unknown): AIError {
    if (error instanceof OpenAI.APIError) {
        if (error.status === 401 || error.status === 403) {
            return {
                type: 'invalid_api_key',
                message: 'Invalid API key. Please check your API key in settings.',
                retryable: false,
                provider: 'openai-compatible',
            };
        }
        if (error.status === 429) {
            return {
                type: 'rate_limit',
                message: 'Rate limit exceeded. Please wait and try again.',
                retryable: true,
                provider: 'openai-compatible',
            };
        }
        if (error.status >= 500) {
            return {
                type: 'server_error',
                message: 'Server error. Please try again later.',
                retryable: true,
                provider: 'openai-compatible',
            };
        }
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (
            message.includes('context_length') ||
            message.includes('maximum context') ||
            message.includes('too many tokens') ||
            message.includes('max_tokens')
        ) {
            return {
                type: 'context_exceeded',
                message: 'The conversation is too long. Please start a new conversation or clear some history.',
                retryable: false,
                provider: 'openai-compatible',
            };
        }
        if (
            message.includes('network') ||
            message.includes('fetch') ||
            message.includes('econnrefused') ||
            message.includes('timeout')
        ) {
            return {
                type: 'network_error',
                message: 'Network error. Please check your endpoint connection.',
                retryable: true,
                provider: 'openai-compatible',
            };
        }
        return {
            type: 'unknown',
            message: error.message,
            retryable: false,
            provider: 'openai-compatible',
        };
    }

    return {
        type: 'unknown',
        message: 'An unknown error occurred',
        retryable: false,
        provider: 'openai-compatible',
    };
}

function isJsonModeUnsupported(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
        if (error.status === 400) {
            const message = error.message.toLowerCase();
            return message.includes('response_format') || message.includes('json');
        }
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('response_format') || message.includes('json mode') || message.includes('json') || message.includes('unsupported');
    }

    return false;
}

function convertToOpenAIMessages(
    messages: StreamOptions['messages'],
    systemPrompt: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const jsonSystemPrompt = `${systemPrompt}

IMPORTANT: You MUST respond with a valid JSON object containing an "actions" array. Each action in the array must have a "_type" field indicating the action type. Example format:
{"actions": [{"_type": "message", "content": "Hello!"}, {"_type": "createShape", "shape": {...}}]}`;

    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: jsonSystemPrompt },
    ];

    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            openaiMessages.push({
                role: msg.role,
                content: msg.content,
            });
            continue;
        }

        const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = msg.content.map(item => {
            if (item.type === 'image') {
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

    return openaiMessages;
}

export async function* streamAgentActions(
    options: StreamOptions
): AsyncGenerator<StreamAction> {
    const { apiKey, baseUrl, modelId, messages, systemPrompt, maxTokens, temperature = 0, signal } = options;

    debugAgent('SEND', 'Starting request', { modelId, maxTokens, temperature, messageCount: messages.length });

    const client = createOpenAICompatibleClient(apiKey, baseUrl);
    const openaiMessages = convertToOpenAIMessages(messages, systemPrompt);

    if (signal?.aborted) {
        throw new Error('Cancelled by user');
    }

    const maxRetries = 3;
    let stream: Awaited<ReturnType<typeof client.chat.completions.create>> | null = null;
    let lastError: unknown;
    let useJsonMode = true;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
            model: modelId,
            messages: openaiMessages,
            stream: true,
            max_tokens: maxTokens,
            temperature,
            ...(useJsonMode ? { response_format: { type: 'json_object' as const } } : {}),
        };

        try {
            debugAgent('SEND', `Creating stream (attempt ${attempt + 1}/${maxRetries + 1})...`, { useJsonMode });
            stream = await client.chat.completions.create(requestOptions);
            debugAgent('SEND', 'Stream created successfully');
            break;
        } catch (error) {
            lastError = error;

            if (signal?.aborted) {
                throw new Error('Cancelled by user');
            }

            if (useJsonMode && isJsonModeUnsupported(error)) {
                debugAgent('FALLBACK', 'JSON mode unsupported, retrying without response_format');
                useJsonMode = false;
                continue;
            }

            if (!isRateLimitError(error) || attempt >= maxRetries) {
                throw error;
            }

            let delayMs = extractRetryDelay(error) ?? Math.min(1000 * Math.pow(2, attempt), 60000);
            delayMs = Math.min(delayMs, 60000);

            debugAgent('RATE_LIMIT', `Rate limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(delayMs, signal);
        }
    }

    if (!stream) {
        throw lastError ?? new Error('Failed to create stream');
    }

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
        let startTime = Date.now();
        let chunkCount = 0;
        let actionCount = 0;
        let lastYieldedActionCount = 0;
        debugAgent('RECEIVE', 'Starting to receive stream events...');

        for await (const chunk of stream) {
            if (aborted || signal?.aborted) {
                break;
            }

            const delta = chunk.choices[0]?.delta;
            if (!delta?.content) continue;

            buffer += delta.content;
            chunkCount++;

            if (chunkCount % 10 === 0) {
                debugAgent('RECEIVE', `Received ${chunkCount} chunks, buffer length: ${buffer.length}`);
            }

            const actions = parseActions(stripCodeFence(buffer));
            if (actions.length === 0) continue;

            // Yield completed actions we haven't yielded yet
            for (let i = lastYieldedActionCount; i < actions.length - 1; i++) {
                actionCount++;
                debugAgent('PROCESS', `Action ${actionCount} complete:`, actions[i]._type);
                yield {
                    ...actions[i],
                    complete: true,
                    time: Date.now() - startTime,
                };
                startTime = Date.now();
            }
            lastYieldedActionCount = Math.max(lastYieldedActionCount, actions.length - 1);

            // Yield the last action as incomplete (still streaming)
            const currentAction = actions[actions.length - 1];
            if (currentAction) {
                yield {
                    ...currentAction,
                    complete: false,
                    time: Date.now() - startTime,
                };
            }
        }

        // Final pass: yield last action as complete
        const finalActions = parseActions(stripCodeFence(buffer));
        if (finalActions.length > 0) {
            const lastAction = finalActions[finalActions.length - 1];
            if (lastAction) {
                actionCount++;
                debugAgent('PROCESS', `Action ${actionCount} complete (final):`, lastAction._type);
                yield {
                    ...lastAction,
                    complete: true,
                    time: Date.now() - startTime,
                };
            }
        }

        debugAgent('RECEIVE', `Stream complete. Total chunks: ${chunkCount}, actions: ${actionCount}`);
    } catch (error) {
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        if (isRateLimitError(error)) {
            const retryDelay = extractRetryDelay(error);
            const delayInfo = retryDelay ? ` (retry after ${Math.ceil(retryDelay / 1000)}s)` : '';
            throw new Error(`Rate limit exceeded${delayInfo}. Please try again later.`);
        }

        throw error;
    } finally {
        if (signal && abortHandler) {
            signal.removeEventListener('abort', abortHandler);
        }
    }
}

export const openaiCompatibleProvider: AIProvider = {
    name: 'openai-compatible',

    createClient(apiKey: string, baseUrl?: string): OpenAI {
        return createOpenAICompatibleClient(apiKey, baseUrl);
    },

    async *streamAgentActions(options: StreamOptions): AsyncGenerator<StreamAction> {
        yield* streamAgentActions(options);
    },

    async testConnection(apiKey: string, baseUrl?: string): Promise<ConnectionResult> {
        return testOpenAICompatibleConnection(apiKey, baseUrl);
    },

    parseError(error: unknown): AIError {
        return parseOpenAICompatibleError(error);
    },
};
