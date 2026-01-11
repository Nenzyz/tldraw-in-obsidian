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
            expect(DEFAULT_SETTINGS.ai.apiKey).toBe('');
            // Model starts empty because models are fetched dynamically from API
            expect(DEFAULT_SETTINGS.ai.model).toBe('');
            expect(DEFAULT_SETTINGS.ai.availableModels).toEqual([]);
            expect(DEFAULT_SETTINGS.ai.showChatPanel).toBe(false);
            expect(DEFAULT_SETTINGS.ai.maxTokens).toBe(4096);
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

        it('should persist API key changes', async () => {
            // Initialize with default settings
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Update the API key
            const testApiKey = 'sk-ant-test-key-12345';
            await settingsManager.updateAIApiKey(testApiKey);

            // Verify saveData was called with updated settings
            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.ai.apiKey).toBe(testApiKey);
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

        it('should correctly provide AI settings via store', async () => {
            // Initialize with custom settings
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    enabled: true,
                    apiKey: 'test-key',
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

            // Verify AI settings are correctly provided
            expect(storeSettings.ai).toBeDefined();
            expect(storeSettings.ai?.enabled).toBe(true);
            expect(storeSettings.ai?.apiKey).toBe('test-key');
            expect(storeSettings.ai?.model).toBe('claude-3-5-sonnet-20241022');
            expect(storeSettings.ai?.showChatPanel).toBe(true);
            expect(storeSettings.ai?.maxTokens).toBe(8192);
        });
    });
});
