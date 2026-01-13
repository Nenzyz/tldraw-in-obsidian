/**
 * Tests for AI settings migration to multi-provider schema.
 * Run with: npx vitest run src/test/settings-migration.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, TldrawPluginSettings } from 'src/obsidian/TldrawSettingsTab';
import UserSettingsManager from 'src/obsidian/settings/UserSettingsManager';

// Mock TldrawPlugin
class MockTldrawPlugin {
    settings: TldrawPluginSettings = {} as TldrawPluginSettings;
    loadData = vi.fn();
    saveData = vi.fn();

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

describe('AI Settings Migration', () => {
    let mockPlugin: MockTldrawPlugin;
    let settingsManager: UserSettingsManager;

    beforeEach(() => {
        mockPlugin = new MockTldrawPlugin();
        settingsManager = new UserSettingsManager(mockPlugin as any);
        vi.clearAllMocks();
    });

    describe('Migration from single apiKey to providers structure', () => {
        it('should migrate existing apiKey to providers.anthropic.apiKey', async () => {
            // Simulate old settings format with single apiKey
            const oldSettings = {
                ai: {
                    enabled: true,
                    apiKey: 'sk-ant-old-api-key-12345',
                    model: 'claude-sonnet-4-20250514',
                    availableModels: [
                        { id: 'claude-sonnet-4-20250514', displayName: 'Claude 4 Sonnet' }
                    ],
                    showChatPanel: true,
                    maxTokens: 4096,
                    // No providers field - old format
                }
            };
            mockPlugin.loadData.mockResolvedValue(oldSettings);

            await settingsManager.loadSettings();

            // Verify migration occurred
            expect(settingsManager.settings.ai?.providers?.anthropic?.apiKey).toBe('sk-ant-old-api-key-12345');
            expect(settingsManager.settings.ai?.providers?.anthropic?.availableModels).toEqual([
                { id: 'claude-sonnet-4-20250514', displayName: 'Claude 4 Sonnet' }
            ]);
        });

        it('should set activeProvider to anthropic when migrating', async () => {
            const oldSettings = {
                ai: {
                    enabled: true,
                    apiKey: 'sk-ant-test-key',
                    model: 'claude-sonnet-4-20250514',
                    availableModels: [],
                    showChatPanel: false,
                    maxTokens: 4096,
                }
            };
            mockPlugin.loadData.mockResolvedValue(oldSettings);

            await settingsManager.loadSettings();

            expect(settingsManager.settings.ai?.activeProvider).toBe('anthropic');
        });
    });

    describe('Default activeProvider', () => {
        it('should default activeProvider to anthropic for new installations', async () => {
            // Simulate fresh installation with no existing settings
            mockPlugin.loadData.mockResolvedValue({});

            await settingsManager.loadSettings();

            expect(settingsManager.settings.ai?.activeProvider).toBe('anthropic');
        });

        it('should preserve activeProvider if already set', async () => {
            const settings = {
                ai: {
                    enabled: true,
                    activeProvider: 'openai' as const,
                    providers: {
                        anthropic: { apiKey: '', availableModels: [] },
                        google: { apiKey: '', availableModels: [] },
                        openai: { apiKey: 'sk-openai-key', availableModels: [] },
                    },
                    model: 'gpt-4o',
                    showChatPanel: true,
                    maxTokens: 4096,
                }
            };
            mockPlugin.loadData.mockResolvedValue(settings);

            await settingsManager.loadSettings();

            expect(settingsManager.settings.ai?.activeProvider).toBe('openai');
        });
    });

    describe('Per-provider availableModels storage', () => {
        it('should store availableModels per provider', async () => {
            const settings = {
                ai: {
                    enabled: true,
                    activeProvider: 'anthropic' as const,
                    providers: {
                        anthropic: {
                            apiKey: 'sk-ant-key',
                            availableModels: [
                                { id: 'claude-sonnet-4-20250514', displayName: 'Claude 4 Sonnet' }
                            ]
                        },
                        google: {
                            apiKey: 'google-key',
                            availableModels: [
                                { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }
                            ]
                        },
                        openai: {
                            apiKey: 'sk-openai-key',
                            availableModels: [
                                { id: 'gpt-4o', displayName: 'GPT-4o' }
                            ]
                        },
                    },
                    model: 'claude-sonnet-4-20250514',
                    showChatPanel: true,
                    maxTokens: 4096,
                }
            };
            mockPlugin.loadData.mockResolvedValue(settings);

            await settingsManager.loadSettings();

            expect(settingsManager.settings.ai?.providers?.anthropic?.availableModels).toHaveLength(1);
            expect(settingsManager.settings.ai?.providers?.google?.availableModels).toHaveLength(1);
            expect(settingsManager.settings.ai?.providers?.openai?.availableModels).toHaveLength(1);
        });
    });

    describe('Backward compatibility', () => {
        it('should not break if providers structure already exists', async () => {
            const newFormatSettings = {
                ai: {
                    enabled: true,
                    activeProvider: 'google' as const,
                    providers: {
                        anthropic: { apiKey: 'ant-key', availableModels: [] },
                        google: { apiKey: 'google-key', availableModels: [] },
                        openai: { apiKey: '', availableModels: [] },
                    },
                    model: 'gemini-2.5-flash',
                    showChatPanel: true,
                    maxTokens: 8192,
                }
            };
            mockPlugin.loadData.mockResolvedValue(newFormatSettings);

            await settingsManager.loadSettings();

            // Verify settings are preserved as-is
            expect(settingsManager.settings.ai?.activeProvider).toBe('google');
            expect(settingsManager.settings.ai?.providers?.anthropic?.apiKey).toBe('ant-key');
            expect(settingsManager.settings.ai?.providers?.google?.apiKey).toBe('google-key');
            expect(settingsManager.settings.ai?.model).toBe('gemini-2.5-flash');
        });

        it('should work with completely empty ai settings', async () => {
            mockPlugin.loadData.mockResolvedValue({});

            await settingsManager.loadSettings();

            // Verify defaults are applied
            expect(settingsManager.settings.ai).toBeDefined();
            expect(settingsManager.settings.ai?.enabled).toBe(false);
            expect(settingsManager.settings.ai?.activeProvider).toBe('anthropic');
            expect(settingsManager.settings.ai?.providers).toBeDefined();
        });
    });

    describe('New settings update methods', () => {
        beforeEach(async () => {
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();
        });

        it('should update activeProvider correctly', async () => {
            await settingsManager.updateAIActiveProvider('google');

            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.activeProvider).toBe('google');
        });

        it('should update provider-specific API key', async () => {
            await settingsManager.updateAIProviderApiKey('openai', 'sk-new-openai-key');

            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.providers.openai.apiKey).toBe('sk-new-openai-key');
        });

        it('should update provider-specific available models', async () => {
            const newModels = [
                { id: 'gpt-4o', displayName: 'GPT-4o' },
                { id: 'gpt-4.1', displayName: 'GPT-4.1' },
            ];
            await settingsManager.updateAIProviderAvailableModels('openai', newModels);

            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.providers.openai.availableModels).toEqual(newModels);
        });
    });
});
