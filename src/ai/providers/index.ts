/**
 * Multi-provider AI integration - barrel export.
 *
 * This module provides the main entry point for the provider abstraction layer.
 * It exports the factory function, type definitions, and individual provider
 * implementations for direct access when needed.
 */

// Export factory function and utilities
export {
    getProvider,
    getProviderSync,
    clearProviderCache,
    isProviderSupported,
} from './factory';

// Export all type definitions
export type {
    AIProvider,
    AIError,
    AIErrorType,
    ConnectionResult,
    FetchedModel,
    Message,
    MessageContentItem,
    StreamAction,
    StreamOptions,
} from './types';

// Export individual providers for direct access if needed
// Note: These are placeholders until Task Groups 2, 3, 4 are implemented
export { anthropicProvider } from './anthropic';
export { geminiProvider } from './gemini';
export { openaiProvider } from './openai';
