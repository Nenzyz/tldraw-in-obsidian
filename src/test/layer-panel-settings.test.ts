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

describe('Layer Panel Settings', () => {
    describe('DEFAULT_SETTINGS', () => {
        it('should have layerPanel.enabled default to true', () => {
            expect(DEFAULT_SETTINGS.layerPanel).toBeDefined();
            expect(DEFAULT_SETTINGS.layerPanel.enabled).toBe(true);
        });

        it('should have layerPanel.defaultCollapsed default to false', () => {
            expect(DEFAULT_SETTINGS.layerPanel).toBeDefined();
            expect(DEFAULT_SETTINGS.layerPanel.defaultCollapsed).toBe(false);
        });
    });

    describe('UserSettingsManager', () => {
        let mockPlugin: MockTldrawPlugin;
        let settingsManager: UserSettingsManager;

        beforeEach(() => {
            mockPlugin = new MockTldrawPlugin();
            settingsManager = new UserSettingsManager(mockPlugin as any);
        });

        it('should persist settings after toggle changes', async () => {
            // Initialize with default settings
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            // Verify initial state
            expect(settingsManager.settings.layerPanel?.enabled).toBe(true);
            expect(settingsManager.settings.layerPanel?.defaultCollapsed).toBe(false);

            // Update the settings
            settingsManager.settings.layerPanel = {
                enabled: false,
                defaultCollapsed: true,
            };
            await settingsManager.updateSettings(settingsManager.settings);

            // Verify saveData was called with updated settings
            expect(mockPlugin.saveData).toHaveBeenCalled();
            const savedSettings = mockPlugin.saveData.mock.calls[0][0];
            expect(savedSettings.layerPanel.enabled).toBe(false);
            expect(savedSettings.layerPanel.defaultCollapsed).toBe(true);
        });

        it('should correctly provide layer panel settings via store', async () => {
            // Initialize with custom settings
            mockPlugin.loadData.mockResolvedValue({
                layerPanel: {
                    enabled: false,
                    defaultCollapsed: true,
                }
            });
            await settingsManager.loadSettings();

            // Get settings via store
            const storeSettings = settingsManager.store.get();

            // Verify layer panel settings are correctly provided
            expect(storeSettings.layerPanel).toBeDefined();
            expect(storeSettings.layerPanel?.enabled).toBe(false);
            expect(storeSettings.layerPanel?.defaultCollapsed).toBe(true);
        });
    });
});
