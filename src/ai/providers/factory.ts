/**
 * Provider factory for multi-provider AI integration.
 *
 * This module provides a factory function to get the appropriate
 * AIProvider implementation based on the provider name.
 */

import type { AgentModelProvider } from '../models';
import type { AIProvider } from './types';

/**
 * Cache for provider instances to avoid re-instantiation.
 */
const providerCache = new Map<AgentModelProvider, AIProvider>();

/**
 * Get the AIProvider implementation for a given provider name.
 *
 * This factory function dynamically imports the appropriate provider
 * module and caches the instance for subsequent calls.
 *
 * @param providerName - The name of the provider ('anthropic', 'google', 'openai')
 * @returns The AIProvider implementation for that provider
 * @throws Error if the provider is not supported
 *
 * @example
 * ```typescript
 * const anthropicProvider = await getProvider('anthropic');
 * const result = await anthropicProvider.testConnection(apiKey);
 * ```
 */
export async function getProvider(providerName: AgentModelProvider): Promise<AIProvider> {
    // Check cache first
    const cached = providerCache.get(providerName);
    if (cached) {
        return cached;
    }

    // Dynamically import the provider module
    let provider: AIProvider;

    switch (providerName) {
        case 'anthropic': {
            const module = await import('./anthropic');
            provider = module.anthropicProvider;
            break;
        }
        case 'google': {
            const module = await import('./gemini');
            provider = module.geminiProvider;
            break;
        }
        case 'openai': {
            const module = await import('./openai');
            provider = module.openaiProvider;
            break;
        }
        case 'openai-compatible': {
            const module = await import('./openai-compatible');
            provider = module.openaiCompatibleProvider;
            break;
        }
        default: {
            // TypeScript should catch this at compile time, but runtime safety
            const exhaustiveCheck: never = providerName;
            throw new Error(`Unsupported AI provider: ${exhaustiveCheck}`);
        }
    }

    // Cache the instance
    providerCache.set(providerName, provider);

    return provider;
}

/**
 * Get the AIProvider implementation synchronously if already loaded.
 *
 * This is useful when you know the provider has already been loaded
 * and want to avoid the async overhead.
 *
 * @param providerName - The name of the provider
 * @returns The AIProvider implementation if cached, undefined otherwise
 */
export function getProviderSync(providerName: AgentModelProvider): AIProvider | undefined {
    return providerCache.get(providerName);
}

/**
 * Clear the provider cache.
 * Mainly useful for testing.
 */
export function clearProviderCache(): void {
    providerCache.clear();
}

/**
 * Check if a provider is supported.
 *
 * @param providerName - The provider name to check
 * @returns true if the provider is supported
 */
export function isProviderSupported(providerName: string): providerName is AgentModelProvider {
    return providerName === 'anthropic' || providerName === 'google' || providerName === 'openai' || providerName === 'openai-compatible';
}
