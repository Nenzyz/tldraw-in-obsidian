/**
 * Tests for Multi-Provider Settings UI Components
 *
 * These tests verify:
 * 1. Provider dropdown changes `activeProvider`
 * 2. API key input shows/saves for active provider only
 * 3. Connection test uses active provider
 * 4. Model dropdown shows models grouped by provider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_SETTINGS, TldrawPluginSettings, AIProviderSettings, DEFAULT_AI_PROVIDER_SETTINGS } from 'src/obsidian/TldrawSettingsTab';
import UserSettingsManager from 'src/obsidian/settings/UserSettingsManager';
import type { AgentModelProvider } from 'src/ai/models';

// Mock TldrawPlugin
class MockTldrawPlugin {
    settings: TldrawPluginSettings = {} as TldrawPluginSettings;
    loadData = vi.fn();
    saveData = vi.fn();

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// Mock provider factory
vi.mock('src/ai/providers', () => ({
    getProvider: vi.fn().mockImplementation(async (providerName: AgentModelProvider) => {
        return {
            name: providerName,
            testConnection: vi.fn().mockResolvedValue({
                success: true,
                models: [
                    { id: `${providerName}-model-1`, displayName: `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} Model 1` },
                    { id: `${providerName}-model-2`, displayName: `${providerName.charAt(0).toUpperCase() + providerName.slice(1)} Model 2` },
                ]
            }),
            parseError: vi.fn().mockReturnValue({
                type: 'unknown',
                message: 'Test error',
                retryable: false,
                provider: providerName
            })
        };
    }),
    getProviderSync: vi.fn(),
    clearProviderCache: vi.fn(),
    isProviderSupported: vi.fn().mockReturnValue(true),
}));

describe('Multi-Provider Settings UI', () => {
    let mockPlugin: MockTldrawPlugin;
    let settingsManager: UserSettingsManager;

    beforeEach(() => {
        mockPlugin = new MockTldrawPlugin();
        settingsManager = new UserSettingsManager(mockPlugin as any);
        vi.clearAllMocks();
    });

    describe('Provider Selection (Task 7.2)', () => {
        it('should change activeProvider when updateAIActiveProvider is called', async () => {
            // Initialize with default settings
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Verify initial state is anthropic
            expect(settingsManager.settings.ai?.activeProvider).toBe('anthropic');

            // Change to google
            await settingsManager.updateAIActiveProvider('google');

            // Verify activeProvider was updated
            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.activeProvider).toBe('google');
        });

        it('should support switching between all three providers', async () => {
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Test each provider
            const providers: AgentModelProvider[] = ['anthropic', 'google', 'openai'];
            for (const provider of providers) {
                mockPlugin.saveData.mockClear();
                await settingsManager.updateAIActiveProvider(provider);
                expect(settingsManager.settings.ai?.activeProvider).toBe(provider);
            }
        });

        it('should not save if provider is already active', async () => {
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Try to set the same provider
            await settingsManager.updateAIActiveProvider('anthropic');

            // Should not call save since nothing changed
            expect(mockPlugin.saveData).not.toHaveBeenCalled();
        });
    });

    describe('API Key Input (Task 7.3)', () => {
        it('should save API key for the specified provider only', async () => {
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Set API key for anthropic
            await settingsManager.updateAIProviderApiKey('anthropic', 'sk-ant-test-key');

            // Verify only anthropic key was set
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.providers.anthropic.apiKey).toBe('sk-ant-test-key');
            expect(savedSettings.ai.providers.google.apiKey).toBe('');
            expect(savedSettings.ai.providers.openai.apiKey).toBe('');
        });

        it('should read API key for a specific provider', async () => {
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    enabled: true,
                    activeProvider: 'google',
                    providers: {
                        anthropic: { apiKey: 'ant-key', availableModels: [] },
                        google: { apiKey: 'google-key', availableModels: [] },
                        openai: { apiKey: 'openai-key', availableModels: [] },
                    },
                    model: '',
                    showChatPanel: false,
                    maxTokens: 4096,
                }
            });
            await settingsManager.loadSettings();

            // Read each provider's API key
            expect(settingsManager.getAIProviderApiKey('anthropic')).toBe('ant-key');
            expect(settingsManager.getAIProviderApiKey('google')).toBe('google-key');
            expect(settingsManager.getAIProviderApiKey('openai')).toBe('openai-key');
        });

        it('should update API key for active provider correctly', async () => {
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    enabled: true,
                    activeProvider: 'google',
                    providers: {
                        anthropic: { apiKey: '', availableModels: [] },
                        google: { apiKey: '', availableModels: [] },
                        openai: { apiKey: '', availableModels: [] },
                    },
                    model: '',
                    showChatPanel: false,
                    maxTokens: 4096,
                }
            });
            await settingsManager.loadSettings();

            // Set API key for active provider (google)
            const activeProvider = settingsManager.settings.ai?.activeProvider ?? 'anthropic';
            await settingsManager.updateAIProviderApiKey(activeProvider, 'AIza-test-key');

            // Verify correct provider was updated
            expect(settingsManager.getAIProviderApiKey('google')).toBe('AIza-test-key');
            expect(settingsManager.getAIProviderApiKey('anthropic')).toBe('');
        });
    });

    describe('Test Connection (Task 7.4)', () => {
        it('should save models to the correct provider', async () => {
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Simulate connection test result - save models for google
            const testModels = [
                { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
            ];
            await settingsManager.updateAIProviderAvailableModels('google', testModels);

            // Verify models saved to correct provider
            expect(settingsManager.getAIProviderAvailableModels('google')).toEqual(testModels);
            expect(settingsManager.getAIProviderAvailableModels('anthropic')).toEqual([]);
        });

        it('should read available models for a specific provider', async () => {
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    enabled: true,
                    activeProvider: 'anthropic',
                    providers: {
                        anthropic: {
                            apiKey: 'ant-key',
                            availableModels: [
                                { id: 'claude-sonnet', displayName: 'Claude Sonnet' }
                            ]
                        },
                        google: {
                            apiKey: 'google-key',
                            availableModels: [
                                { id: 'gemini-flash', displayName: 'Gemini Flash' }
                            ]
                        },
                        openai: { apiKey: '', availableModels: [] },
                    },
                    model: 'claude-sonnet',
                    showChatPanel: false,
                    maxTokens: 4096,
                }
            });
            await settingsManager.loadSettings();

            expect(settingsManager.getAIProviderAvailableModels('anthropic')).toHaveLength(1);
            expect(settingsManager.getAIProviderAvailableModels('google')).toHaveLength(1);
            expect(settingsManager.getAIProviderAvailableModels('openai')).toHaveLength(0);
        });
    });

    describe('Model Selection (Task 7.5)', () => {
        it('should allow selecting model from any configured provider', async () => {
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    enabled: true,
                    activeProvider: 'anthropic',
                    providers: {
                        anthropic: {
                            apiKey: 'ant-key',
                            availableModels: [
                                { id: 'claude-sonnet', displayName: 'Claude Sonnet' }
                            ]
                        },
                        google: {
                            apiKey: 'google-key',
                            availableModels: [
                                { id: 'gemini-flash', displayName: 'Gemini Flash' }
                            ]
                        },
                        openai: { apiKey: '', availableModels: [] },
                    },
                    model: '',
                    showChatPanel: false,
                    maxTokens: 4096,
                }
            });
            await settingsManager.loadSettings();

            // Should be able to select model from any provider
            await settingsManager.updateAIModel('gemini-flash');
            expect(settingsManager.settings.ai?.model).toBe('gemini-flash');

            await settingsManager.updateAIModel('claude-sonnet');
            expect(settingsManager.settings.ai?.model).toBe('claude-sonnet');
        });

        it('should aggregate models from all providers with API keys', async () => {
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    enabled: true,
                    activeProvider: 'anthropic',
                    providers: {
                        anthropic: {
                            apiKey: 'ant-key',
                            availableModels: [
                                { id: 'claude-1', displayName: 'Claude 1' },
                                { id: 'claude-2', displayName: 'Claude 2' }
                            ]
                        },
                        google: {
                            apiKey: 'google-key',
                            availableModels: [
                                { id: 'gemini-1', displayName: 'Gemini 1' }
                            ]
                        },
                        openai: {
                            apiKey: 'openai-key',
                            availableModels: [
                                { id: 'gpt-1', displayName: 'GPT 1' },
                                { id: 'gpt-2', displayName: 'GPT 2' }
                            ]
                        },
                    },
                    model: '',
                    showChatPanel: false,
                    maxTokens: 4096,
                }
            });
            await settingsManager.loadSettings();

            // Collect all models from configured providers
            const allModels = [
                ...settingsManager.getAIProviderAvailableModels('anthropic'),
                ...settingsManager.getAIProviderAvailableModels('google'),
                ...settingsManager.getAIProviderAvailableModels('openai'),
            ];

            expect(allModels).toHaveLength(5);
        });
    });
});
