import React, { useCallback, useState } from "react";
import Setting from "./Setting";
import useSettingsManager from "src/hooks/useSettingsManager";
import useUserPluginSettings from "src/hooks/useUserPluginSettings";
import { DEFAULT_SETTINGS } from "src/obsidian/TldrawSettingsTab";
import { testAnthropicConnection } from "src/ai/anthropic-client";

function AIEnabledSetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const onEnabledChange = useCallback(async (value: boolean) => {
        await settingsManager.updateAIEnabled(value);
    }, [settingsManager]);

    const aiEnabled = settings.ai?.enabled ?? DEFAULT_SETTINGS.ai.enabled;

    return (
        <Setting
            slots={{
                name: 'Enable AI assistant',
                desc: (
                    <>
                        Enable AI-powered canvas manipulation through a chat interface.
                        <code className="ptl-default-code">
                            DEFAULT: {DEFAULT_SETTINGS.ai.enabled ? 'On' : 'Off'}
                        </code>
                    </>
                ),
                control: (
                    <Setting.Toggle
                        value={aiEnabled}
                        onChange={onEnabledChange}
                    />
                )
            }}
        />
    );
}

function APIKeySetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);
    const [showKey, setShowKey] = useState(false);

    const onApiKeyChange = useCallback(async (value: string) => {
        await settingsManager.updateAIApiKey(value);
    }, [settingsManager]);

    const apiKey = settings.ai?.apiKey ?? '';
    const aiEnabled = settings.ai?.enabled ?? false;

    // Create a masked version of the key for display
    const displayValue = showKey ? apiKey : (apiKey ? '****' + apiKey.slice(-4) : '');

    return (
        <Setting
            slots={{
                name: 'Anthropic API key',
                desc: (
                    <>
                        <p>Your Anthropic API key for AI features. Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>.</p>
                        <p style={{ color: 'var(--color-yellow)', marginTop: '0.5em' }}>
                            <strong>Security note:</strong> Your API key is stored locally in Obsidian's plugin data and is not synced. Never share your API key.
                        </p>
                    </>
                ),
                control: (
                    <>
                        <input
                            type={showKey ? 'text' : 'password'}
                            className="ptl-ai-api-key-input"
                            value={apiKey}
                            placeholder="sk-ant-..."
                            onChange={(e) => onApiKeyChange(e.target.value)}
                            style={{
                                width: '200px',
                                fontFamily: 'monospace',
                            }}
                        />
                        <Setting.ExtraButton
                            icon={showKey ? 'eye-off' : 'eye'}
                            tooltip={showKey ? 'Hide API key' : 'Show API key'}
                            onClick={() => setShowKey(!showKey)}
                        />
                    </>
                )
            }}
            disabled={!aiEnabled}
        />
    );
}

function ModelSelectionSetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const onModelChange = useCallback(async (value: string) => {
        await settingsManager.updateAIModel(value);
    }, [settingsManager]);

    const model = settings.ai?.model ?? '';
    const aiEnabled = settings.ai?.enabled ?? false;
    const availableModels = settings.ai?.availableModels ?? [];

    // Build options from fetched models
    const modelOptions: Record<string, string> = {};
    for (const m of availableModels) {
        modelOptions[m.id] = m.displayName;
    }

    const hasModels = availableModels.length > 0;

    return (
        <Setting
            slots={{
                name: 'AI model',
                desc: (
                    <>
                        {hasModels ? (
                            'Select the Claude model to use for AI assistance.'
                        ) : (
                            <span style={{ color: 'var(--text-muted)' }}>
                                Click "Test Connection" below to load available models.
                            </span>
                        )}
                    </>
                ),
                control: hasModels ? (
                    <Setting.Dropdown
                        value={model}
                        options={modelOptions}
                        onChange={onModelChange}
                        disabled={!aiEnabled}
                    />
                ) : (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No models loaded
                    </span>
                )
            }}
            disabled={!aiEnabled}
        />
    );
}

function TestConnectionButton() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [modelsLoaded, setModelsLoaded] = useState<number>(0);

    const apiKey = settings.ai?.apiKey ?? '';
    const aiEnabled = settings.ai?.enabled ?? false;
    const currentModel = settings.ai?.model ?? '';

    const handleTestConnection = useCallback(async () => {
        if (!apiKey) {
            setTestStatus('error');
            setErrorMessage('Please enter an API key first.');
            return;
        }

        setTestStatus('testing');
        setErrorMessage('');
        setModelsLoaded(0);

        try {
            const result = await testAnthropicConnection(apiKey);
            if (result.success && result.models) {
                // Save the fetched models
                await settingsManager.updateAIAvailableModels(result.models);
                setModelsLoaded(result.models.length);

                // Auto-select first model if none selected
                if (!currentModel && result.models.length > 0) {
                    await settingsManager.updateAIModel(result.models[0].id);
                }

                setTestStatus('success');
            } else {
                setTestStatus('error');
                setErrorMessage(result.error || 'Connection failed');
            }
        } catch (err) {
            setTestStatus('error');
            setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
        }

        // Reset status after 5 seconds
        setTimeout(() => {
            setTestStatus('idle');
            setErrorMessage('');
            setModelsLoaded(0);
        }, 5000);
    }, [apiKey, currentModel, settingsManager]);

    const getStatusText = () => {
        switch (testStatus) {
            case 'testing': return 'Testing...';
            case 'success': return `Connected! ${modelsLoaded} models loaded.`;
            case 'error': return errorMessage || 'Connection failed';
            default: return '';
        }
    };

    const getStatusColor = () => {
        switch (testStatus) {
            case 'success': return 'var(--color-green)';
            case 'error': return 'var(--color-red)';
            default: return 'var(--text-muted)';
        }
    };

    return (
        <Setting
            slots={{
                name: 'Test connection',
                desc: (
                    <>
                        Verify your API key works correctly.
                        {testStatus !== 'idle' && (
                            <span style={{
                                marginLeft: '1em',
                                color: getStatusColor(),
                                fontWeight: testStatus === 'success' ? 'bold' : 'normal'
                            }}>
                                {getStatusText()}
                            </span>
                        )}
                    </>
                ),
                control: (
                    <Setting.Button
                        onClick={handleTestConnection}
                    >
                        {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                    </Setting.Button>
                )
            }}
            disabled={!aiEnabled || !apiKey || testStatus === 'testing'}
        />
    );
}

function MaxTokensSetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const onMaxTokensChange = useCallback(async (value: string) => {
        const parsedValue = parseInt(value);
        if (Number.isNaN(parsedValue) || parsedValue <= 0) return;
        await settingsManager.updateAIMaxTokens(parsedValue);
    }, [settingsManager]);

    const maxTokens = settings.ai?.maxTokens ?? DEFAULT_SETTINGS.ai.maxTokens;
    const aiEnabled = settings.ai?.enabled ?? false;

    return (
        <Setting
            slots={{
                name: 'Max tokens',
                desc: (
                    <>
                        Maximum number of tokens for AI responses. Higher values allow longer responses but cost more.
                        <code className="ptl-default-code">
                            DEFAULT: {DEFAULT_SETTINGS.ai.maxTokens}
                        </code>
                    </>
                ),
                control: (
                    <Setting.Text
                        value={`${maxTokens}`}
                        placeholder={`${DEFAULT_SETTINGS.ai.maxTokens}`}
                        onChange={onMaxTokensChange}
                    />
                )
            }}
            disabled={!aiEnabled}
        />
    );
}

export default function AISettings() {
    return (
        <>
            <h2>AI Assistant</h2>
            <p style={{ marginBottom: '1em', color: 'var(--text-muted)' }}>
                Enable AI-powered canvas manipulation. The AI can create, modify, and describe shapes on your canvas through natural language commands.
            </p>
            <Setting.Container>
                <AIEnabledSetting />
            </Setting.Container>
            <h2>API Configuration</h2>
            <Setting.Container>
                <APIKeySetting />
                <ModelSelectionSetting />
                <TestConnectionButton />
            </Setting.Container>
            <h2>Advanced</h2>
            <Setting.Container>
                <MaxTokensSetting />
            </Setting.Container>
        </>
    );
}
