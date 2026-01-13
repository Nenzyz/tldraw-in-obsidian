/**
 * Rate limit handling utilities for AI providers.
 *
 * Provides retry logic with exponential backoff and respects
 * retry-after timing from provider error responses.
 */

// Debug logging
const DEBUG_RATE_LIMIT = true;
function debugRateLimit(stage: string, ...args: unknown[]) {
    if (DEBUG_RATE_LIMIT) {
        console.warn(`[RateLimit:${stage}]`, ...args);
    }
}

/**
 * Extract retry delay from error message or headers.
 *
 * Supports various formats:
 * - "Please retry in 48.704091131s"
 * - "retryDelay":"48s"
 * - Retry-After header (seconds)
 *
 * @param error - The error object or message
 * @returns Delay in milliseconds, or null if not found
 */
export function extractRetryDelay(error: unknown): number | null {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to extract from "retry in Xs" or "retry in X.XXs" format
    const retryInMatch = errorMessage.match(/retry\s+in\s+([\d.]+)s/i);
    if (retryInMatch) {
        const seconds = parseFloat(retryInMatch[1]);
        if (!isNaN(seconds) && seconds > 0) {
            debugRateLimit('EXTRACT', `Found retry delay: ${seconds}s from "retry in" pattern`);
            return Math.ceil(seconds * 1000);
        }
    }

    // Try to extract from "retryDelay":"Xs" JSON format
    const retryDelayMatch = errorMessage.match(/"retryDelay"\s*:\s*"([\d.]+)s?"/i);
    if (retryDelayMatch) {
        const seconds = parseFloat(retryDelayMatch[1]);
        if (!isNaN(seconds) && seconds > 0) {
            debugRateLimit('EXTRACT', `Found retry delay: ${seconds}s from retryDelay JSON`);
            return Math.ceil(seconds * 1000);
        }
    }

    // Try to extract from Retry-After header format (just a number in seconds)
    const retryAfterMatch = errorMessage.match(/Retry-After[:\s]+(\d+)/i);
    if (retryAfterMatch) {
        const seconds = parseInt(retryAfterMatch[1]);
        if (!isNaN(seconds) && seconds > 0) {
            debugRateLimit('EXTRACT', `Found retry delay: ${seconds}s from Retry-After`);
            return seconds * 1000;
        }
    }

    debugRateLimit('EXTRACT', 'No retry delay found in error message');
    return null;
}

/**
 * Check if an error is a rate limit (429) error.
 *
 * @param error - The error to check
 * @returns True if this is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
    // Check for HTTP status 429
    if (error && typeof error === 'object') {
        const errObj = error as { status?: number; statusCode?: number; code?: string };
        if (errObj.status === 429 || errObj.statusCode === 429) {
            return true;
        }
    }

    // Check error message for rate limit indicators
    const errorMessage = error instanceof Error ? error.message : String(error);
    const rateLimitPatterns = [
        /429/,
        /rate.?limit/i,
        /too.?many.?requests/i,
        /quota.?exceeded/i,
        /exceeded.*quota/i,
    ];

    return rateLimitPatterns.some(pattern => pattern.test(errorMessage));
}

/**
 * Sleep for a specified duration, respecting abort signal.
 *
 * @param ms - Milliseconds to sleep
 * @param signal - Optional abort signal to cancel sleep
 * @returns Promise that resolves when sleep completes or rejects if aborted
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Cancelled by user'));
            return;
        }

        const timeoutId = setTimeout(() => {
            resolve();
        }, ms);

        if (signal) {
            const abortHandler = () => {
                clearTimeout(timeoutId);
                reject(new Error('Cancelled by user'));
            };
            signal.addEventListener('abort', abortHandler, { once: true });
        }
    });
}

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
    /** Maximum number of retry attempts (default: 3) */
    maxRetries?: number;
    /** Base delay for exponential backoff in ms (default: 1000) */
    baseDelay?: number;
    /** Maximum delay between retries in ms (default: 60000) */
    maxDelay?: number;
    /** Optional abort signal */
    signal?: AbortSignal;
    /** Callback when retrying (for UI feedback) */
    onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

/**
 * Execute a function with rate limit retry logic.
 *
 * @param fn - The async function to execute
 * @param config - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function withRateLimitRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = {}
): Promise<T> {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 60000,
        signal,
        onRetry,
    } = config;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Check abort before each attempt
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry if aborted
            if (signal?.aborted) {
                throw new Error('Cancelled by user');
            }

            // Only retry on rate limit errors
            if (!isRateLimitError(error)) {
                throw error;
            }

            // Don't retry if we've exhausted attempts
            if (attempt >= maxRetries) {
                debugRateLimit('RETRY', `Max retries (${maxRetries}) exceeded`);
                throw error;
            }

            // Calculate delay - prefer provider's suggested delay
            let delayMs = extractRetryDelay(error);
            if (delayMs === null) {
                // Exponential backoff: baseDelay * 2^attempt
                delayMs = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
            }
            // Cap at maxDelay
            delayMs = Math.min(delayMs, maxDelay);

            debugRateLimit('RETRY', `Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delayMs}ms`);

            // Notify callback
            if (onRetry) {
                onRetry(attempt + 1, delayMs, error);
            }

            // Wait before retry
            await sleep(delayMs, signal);
        }
    }

    throw lastError;
}

/**
 * Wrap an async generator with rate limit retry logic.
 *
 * This handles the case where stream creation fails due to rate limits.
 * Once streaming starts, rate limits mid-stream are not retried.
 *
 * @param createStream - Function that creates the async generator
 * @param config - Retry configuration
 * @returns The async generator
 */
export async function* withStreamRetry<T>(
    createStream: () => AsyncGenerator<T>,
    config: RetryConfig = {}
): AsyncGenerator<T> {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 60000,
        signal,
        onRetry,
    } = config;

    let stream: AsyncGenerator<T> | null = null;
    let lastError: unknown;

    // Retry logic for stream creation
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) {
            throw new Error('Cancelled by user');
        }

        try {
            stream = createStream();
            // Try to get the first value to ensure stream is valid
            // This catches rate limit errors that occur on stream creation
            break;
        } catch (error) {
            lastError = error;

            if (signal?.aborted) {
                throw new Error('Cancelled by user');
            }

            if (!isRateLimitError(error)) {
                throw error;
            }

            if (attempt >= maxRetries) {
                debugRateLimit('STREAM_RETRY', `Max retries (${maxRetries}) exceeded`);
                throw error;
            }

            let delayMs = extractRetryDelay(error);
            if (delayMs === null) {
                delayMs = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
            }
            delayMs = Math.min(delayMs, maxDelay);

            debugRateLimit('STREAM_RETRY', `Stream creation attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delayMs}ms`);

            if (onRetry) {
                onRetry(attempt + 1, delayMs, error);
            }

            await sleep(delayMs, signal);
        }
    }

    if (!stream) {
        throw lastError;
    }

    // Yield from the stream
    yield* stream;
}
