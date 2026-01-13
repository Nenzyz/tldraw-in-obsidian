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

describe('Configurable Prompt Settings', () => {
    let mockPlugin: MockTldrawPlugin;
    let settingsManager: UserSettingsManager;

    beforeEach(() => {
        mockPlugin = new MockTldrawPlugin();
        settingsManager = new UserSettingsManager(mockPlugin as any);
    });

    describe('customSystemPrompt field', () => {
        it('should store and retrieve customSystemPrompt', async () => {
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            const customPrompt = 'You are a helpful AI assistant for canvas operations.';
            await settingsManager.updateAICustomSystemPrompt(customPrompt);

            expect(mockPlugin.saveData).toHaveBeenCalled();
            const lastCall = mockPlugin.saveData.mock.calls[mockPlugin.saveData.mock.calls.length - 1][0];
            expect(lastCall.ai.customSystemPrompt).toBe(customPrompt);
        });

        it('should clear customSystemPrompt when undefined is passed', async () => {
            // Start with a custom prompt
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    customSystemPrompt: 'Some existing prompt',
                },
            });
            await settingsManager.loadSettings();

            // Clear the prompt by passing undefined
            await settingsManager.updateAICustomSystemPrompt(undefined);

            expect(mockPlugin.saveData).toHaveBeenCalled();
            const lastCall = mockPlugin.saveData.mock.calls[mockPlugin.saveData.mock.calls.length - 1][0];
            expect(lastCall.ai.customSystemPrompt).toBeUndefined();
        });
    });

    describe('customJsonSchema field', () => {
        it('should store and retrieve customJsonSchema', async () => {
            mockPlugin.loadData.mockResolvedValue({});
            await settingsManager.loadSettings();

            const customSchema = JSON.stringify({
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "type": "object",
                "properties": {
                    "actions": { "type": "array" }
                }
            });
            await settingsManager.updateAICustomJsonSchema(customSchema);

            expect(mockPlugin.saveData).toHaveBeenCalled();
            const lastCall = mockPlugin.saveData.mock.calls[mockPlugin.saveData.mock.calls.length - 1][0];
            expect(lastCall.ai.customJsonSchema).toBe(customSchema);
        });

        it('should clear customJsonSchema when undefined is passed', async () => {
            // Start with a custom schema
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    customJsonSchema: '{"type": "object"}',
                },
            });
            await settingsManager.loadSettings();

            // Clear the schema by passing undefined
            await settingsManager.updateAICustomJsonSchema(undefined);

            expect(mockPlugin.saveData).toHaveBeenCalled();
            const lastCall = mockPlugin.saveData.mock.calls[mockPlugin.saveData.mock.calls.length - 1][0];
            expect(lastCall.ai.customJsonSchema).toBeUndefined();
        });
    });

    describe('undefined and empty string handling', () => {
        it('should not modify settings when same value is passed', async () => {
            const customPrompt = 'My custom prompt';
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    customSystemPrompt: customPrompt,
                },
            });
            await settingsManager.loadSettings();

            // Clear mock call count
            mockPlugin.saveData.mockClear();

            // Pass the same value - should not trigger save
            await settingsManager.updateAICustomSystemPrompt(customPrompt);

            expect(mockPlugin.saveData).not.toHaveBeenCalled();
        });

        it('should handle empty string as a valid value', async () => {
            mockPlugin.loadData.mockResolvedValue({
                ai: {
                    customSystemPrompt: 'Some prompt',
                },
            });
            await settingsManager.loadSettings();

            // Set to empty string (different from undefined)
            await settingsManager.updateAICustomSystemPrompt('');

            expect(mockPlugin.saveData).toHaveBeenCalled();
            const lastCall = mockPlugin.saveData.mock.calls[mockPlugin.saveData.mock.calls.length - 1][0];
            expect(lastCall.ai.customSystemPrompt).toBe('');
        });
    });
});
