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

describe('AI Settings', () => {
    describe('DEFAULT_SETTINGS', () => {
        it('should have ai settings with correct defaults', () => {
            expect(DEFAULT_SETTINGS.ai).toBeDefined();
            expect(DEFAULT_SETTINGS.ai.enabled).toBe(false);
            // New multi-provider format
            expect(DEFAULT_SETTINGS.ai.activeProvider).toBe('anthropic');
            expect(DEFAULT_SETTINGS.ai.providers.anthropic.apiKey).toBe('');
            expect(DEFAULT_SETTINGS.ai.providers.anthropic.availableModels).toEqual([]);
            expect(DEFAULT_SETTINGS.ai.providers.google.apiKey).toBe('');
            expect(DEFAULT_SETTINGS.ai.providers.openai.apiKey).toBe('');
            expect(DEFAULT_SETTINGS.ai.providers['openai-compatible'].apiKey).toBe('');
            expect(DEFAULT_SETTINGS.ai.providers['openai-compatible'].baseUrl).toBe('http://localhost:11434/v1');
            // Model starts empty because models are fetched dynamically from API
            expect(DEFAULT_SETTINGS.ai.model).toBe('');
            expect(DEFAULT_SETTINGS.ai.showChatPanel).toBe(false);
            expect(DEFAULT_SETTINGS.ai.maxTokens).toBe(4096);
            // Deprecated fields kept for migration
            expect(DEFAULT_SETTINGS.ai.apiKey).toBe('');
            expect(DEFAULT_SETTINGS.ai.availableModels).toEqual([]);
        });
    });

    describe('UserSettingsManager AI Settings', () => {
        let mockPlugin: MockTldrawPlugin;
        let settingsManager: UserSettingsManager;

        beforeEach(() => {
            mockPlugin = new MockTldrawPlugin();
            settingsManager = new UserSettingsManager(mockPlugin as any);
        });

        it('should persist AI enabled toggle changes', async () => {
            // Initialize with default settings
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Verify initial state
            expect(settingsManager.settings.ai?.enabled).toBe(false);

            // Update the settings
            await settingsManager.updateAIEnabled(true);

            // Verify saveData was called with updated settings
            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.enabled).toBe(true);
        });

        it('should persist API key changes via deprecated method', async () => {
            // Initialize with default settings
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Update the API key using deprecated method (delegates to anthropic)
            const testApiKey = 'sk-ant-test-key-12345';
            await settingsManager.updateAIApiKey(testApiKey);

            // Verify saveData was called with updated settings in new format
            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.providers.anthropic.apiKey).toBe(testApiKey);
        });

        it('should persist model selection changes', async () => {
            // Initialize with default settings
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Update the model
            await settingsManager.updateAIModel('claude-sonnet-4-20250514');

            // Verify saveData was called with updated settings
            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.model).toBe('claude-sonnet-4-20250514');
        });

        it('should correctly migrate and provide AI settings via store', async () => {
            // Initialize with OLD format settings (simulating upgrade scenario)
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    enabled: true,
                    apiKey: 'test-key', // Old format
                    model: 'claude-3-5-sonnet-20241022',
                    availableModels: [
                        { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' }
                    ],
                    showChatPanel: true,
                    maxTokens: 8192,
                }
            });
            await settingsManager.loadSettings();

            // Get settings via store
            const storeSettings = settingsManager.store.get();

            // Verify AI settings are correctly migrated to new format
            expect(storeSettings.ai).toBeDefined();
            expect(storeSettings.ai?.enabled).toBe(true);
            // Old apiKey should be migrated to providers.anthropic.apiKey
            expect(storeSettings.ai?.providers.anthropic.apiKey).toBe('test-key');
            expect(storeSettings.ai?.providers.anthropic.availableModels).toEqual([
                { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' }
            ]);
            expect(storeSettings.ai?.activeProvider).toBe('anthropic');
            expect(storeSettings.ai?.model).toBe('claude-3-5-sonnet-20241022');
            expect(storeSettings.ai?.showChatPanel).toBe(true);
            expect(storeSettings.ai?.maxTokens).toBe(8192);
        });

        it('should correctly provide AI settings in new format via store', async () => {
            // Initialize with NEW format settings
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    enabled: true,
                    activeProvider: 'google',
                    providers: {
                        anthropic: { apiKey: 'ant-key', availableModels: [] },
                        google: { apiKey: 'google-key', availableModels: [
                            { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }
                        ]},
                        openai: { apiKey: '', availableModels: [] },
                        'openai-compatible': { apiKey: '', availableModels: [], baseUrl: 'http://localhost:11434/v1' },
                    },
                    model: 'gemini-2.5-flash',
                    showChatPanel: true,
                    maxTokens: 8192,
                }
            });
            await settingsManager.loadSettings();

            // Get settings via store
            const storeSettings = settingsManager.store.get();

            // Verify AI settings are correctly loaded
            expect(storeSettings.ai).toBeDefined();
            expect(storeSettings.ai?.enabled).toBe(true);
            expect(storeSettings.ai?.activeProvider).toBe('google');
            expect(storeSettings.ai?.providers.anthropic.apiKey).toBe('ant-key');
            expect(storeSettings.ai?.providers.google.apiKey).toBe('google-key');
            expect(storeSettings.ai?.providers.google.availableModels).toEqual([
                { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' }
            ]);
            expect(storeSettings.ai?.model).toBe('gemini-2.5-flash');
        });

        it('should persist baseUrl changes for openai-compatible provider', async () => {
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            await settingsManager.updateAIProviderBaseUrl('openai-compatible', 'http://localhost:1234/v1');

            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.providers['openai-compatible'].baseUrl).toBe('http://localhost:1234/v1');
        });

        it('should return default baseUrl when not set', async () => {
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            expect(settingsManager.getAIProviderBaseUrl('openai-compatible')).toBe('http://localhost:11434/v1');
        });
    });
});
