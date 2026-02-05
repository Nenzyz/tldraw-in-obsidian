import React, { useCallback, useMemo, useState } from "react";
import Setting from "./Setting";
import useSettingsManager from "src/hooks/useSettingsManager";
import useUserPluginSettings from "src/hooks/useUserPluginSettings";
import { DEFAULT_SETTINGS, AIModelInfo } from "src/obsidian/TldrawSettingsTab";
import { getProvider } from "src/ai/providers";
import type { AgentModelProvider } from "src/ai/models";

/**
 * Provider display information for the UI
 */
const PROVIDER_INFO: Record<AgentModelProvider, {
    displayName: string;
    keyLabel: string;
    keyPlaceholder: string;
    helpUrl: string;
    helpLinkText: string;
}> = {
    anthropic: {
        displayName: 'Anthropic (Claude)',
        keyLabel: 'Anthropic API key',
        keyPlaceholder: 'sk-ant-...',
        helpUrl: 'https://console.anthropic.com/settings/keys',
        helpLinkText: 'console.anthropic.com',
    },
    google: {
        displayName: 'Google (Gemini)',
        keyLabel: 'Google API key',
        keyPlaceholder: 'AIza...',
        helpUrl: 'https://aistudio.google.com/apikey',
        helpLinkText: 'aistudio.google.com',
    },
    openai: {
        displayName: 'OpenAI (GPT)',
        keyLabel: 'OpenAI API key',
        keyPlaceholder: 'sk-...',
        helpUrl: 'https://platform.openai.com/api-keys',
        helpLinkText: 'platform.openai.com',
    },
    'openai-compatible': {
        displayName: 'OpenAI-Compatible (Ollama)',
        keyLabel: 'API key (optional)',
        keyPlaceholder: 'Leave empty for Ollama',
        helpUrl: 'https://ollama.ai',
        helpLinkText: 'ollama.ai',
    },
};

/**
 * Provider display order for dropdowns and grouping
 * Note: 'google' (Gemini) is intentionally hidden from UI but code remains intact
 */
const PROVIDER_ORDER: AgentModelProvider[] = ['anthropic', 'openai', 'openai-compatible'];

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

/**
 * Task 7.2: Provider selection dropdown component
 */
function ProviderSelectionSetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const onProviderChange = useCallback(async (value: string) => {
        await settingsManager.updateAIActiveProvider(value as AgentModelProvider);
    }, [settingsManager]);

    const activeProvider = settings.ai?.activeProvider ?? 'anthropic';
    const aiEnabled = settings.ai?.enabled ?? false;
    const providers = settings.ai?.providers ?? DEFAULT_SETTINGS.ai.providers;

    // Build dropdown options with status indicators
    const providerOptions = useMemo(() => {
        const options: Record<string, string> = {};
        for (const provider of PROVIDER_ORDER) {
            const info = PROVIDER_INFO[provider];
            const hasKey = !!providers[provider]?.apiKey;
            // Add checkmark indicator for configured providers
            const indicator = hasKey ? ' \u2713' : '';
            options[provider] = `${info.displayName}${indicator}`;
        }
        return options;
    }, [providers]);

    return (
        <Setting
            slots={{
                name: 'AI provider',
                desc: (
                    <>
                        Select which AI provider to use. Providers marked with \u2713 have API keys configured.
                    </>
                ),
                control: (
                    <Setting.Dropdown
                        value={activeProvider}
                        options={providerOptions}
                        onChange={onProviderChange}
                        disabled={!aiEnabled}
                    />
                )
            }}
            disabled={!aiEnabled}
        />
    );
}

/**
 * Task 7.3: API key input component for active provider
 */
function APIKeySetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);
    const [showKey, setShowKey] = useState(false);

    const activeProvider = settings.ai?.activeProvider ?? 'anthropic';
    const aiEnabled = settings.ai?.enabled ?? false;
    const apiKey = settings.ai?.providers?.[activeProvider]?.apiKey ?? '';

    const providerInfo = PROVIDER_INFO[activeProvider];

    const onApiKeyChange = useCallback(async (value: string) => {
        await settingsManager.updateAIProviderApiKey(activeProvider, value);
    }, [settingsManager, activeProvider]);

    return (
        <Setting
            slots={{
                name: providerInfo.keyLabel,
                desc: (
                    <>
                        <p>
                            Your {PROVIDER_INFO[activeProvider].displayName} API key. Get one at{' '}
                            <a href={providerInfo.helpUrl} target="_blank" rel="noopener noreferrer">
                                {providerInfo.helpLinkText}
                            </a>.
                        </p>
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
                            placeholder={providerInfo.keyPlaceholder}
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

function BaseURLSetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const activeProvider = settings.ai?.activeProvider ?? 'anthropic';
    const aiEnabled = settings.ai?.enabled ?? false;
    const baseUrl = settings.ai?.providers?.['openai-compatible']?.baseUrl
        ?? DEFAULT_SETTINGS.ai.providers['openai-compatible'].baseUrl
        ?? '';

    const onBaseUrlChange = useCallback(async (value: string) => {
        await settingsManager.updateAIProviderBaseUrl('openai-compatible', value);
    }, [settingsManager]);

    if (activeProvider !== 'openai-compatible') {
        return null;
    }

    return (
        <Setting
            slots={{
                name: 'Base URL',
                desc: (
                    <>
                        Custom endpoint URL for OpenAI-compatible servers (Ollama, LM Studio, LocalAI).
                        <code className="ptl-default-code">
                            DEFAULT: {DEFAULT_SETTINGS.ai.providers['openai-compatible'].baseUrl}
                        </code>
                    </>
                ),
                control: (
                    <Setting.Text
                        value={baseUrl}
                        placeholder={DEFAULT_SETTINGS.ai.providers['openai-compatible'].baseUrl}
                        onChange={onBaseUrlChange}
                    />
                )
            }}
            disabled={!aiEnabled}
        />
    );
}

/**
 * Task 7.5: Model selection dropdown with provider grouping
 */
function ModelSelectionSetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const onModelChange = useCallback(async (value: string) => {
        // Ignore divider selections
        if (value.startsWith('__divider_')) {
            return;
        }
        await settingsManager.updateAIModel(value);
    }, [settingsManager]);

    const model = settings.ai?.model ?? '';
    const aiEnabled = settings.ai?.enabled ?? false;
    const providers = settings.ai?.providers ?? DEFAULT_SETTINGS.ai.providers;

    // Build options grouped by provider
    const { modelOptions, hasModels, configuredProviders, unconfiguredProviders } = useMemo(() => {
        const options: Record<string, string> = {};
        let totalModels = 0;
        const configured: AgentModelProvider[] = [];
        const unconfigured: AgentModelProvider[] = [];

        for (const provider of PROVIDER_ORDER) {
            const providerSettings = providers[provider];
            const hasKey = !!providerSettings?.apiKey;
            const providerModels = providerSettings?.availableModels ?? [];
            const isConfigured = hasKey || provider === 'openai-compatible';

            if (isConfigured && providerModels.length > 0) {
                const info = PROVIDER_INFO[provider];
                options[`__divider_${provider}`] = `--- ${info.displayName} ---`;

                for (const m of providerModels) {
                    options[m.id] = m.displayName;
                    totalModels++;
                }
                configured.push(provider);
            } else if (!isConfigured) {
                unconfigured.push(provider);
            }
        }

        return {
            modelOptions: options,
            hasModels: totalModels > 0,
            configuredProviders: configured,
            unconfiguredProviders: unconfigured,
        };
    }, [providers]);

    // Build description based on state
    const description = useMemo(() => {
        if (hasModels) {
            const hints: string[] = [];
            if (unconfiguredProviders.length > 0) {
                const names = unconfiguredProviders.map(p => PROVIDER_INFO[p].displayName).join(', ');
                hints.push(`Configure API keys to see models from: ${names}`);
            }
            return (
                <>
                    Select the AI model to use.
                    {hints.length > 0 && (
                        <span style={{ display: 'block', color: 'var(--text-muted)', marginTop: '0.3em', fontSize: '0.9em' }}>
                            {hints[0]}
                        </span>
                    )}
                </>
            );
        }
        return (
            <span style={{ color: 'var(--text-muted)' }}>
                Click "Test Connection" to load available models for the active provider.
            </span>
        );
    }, [hasModels, unconfiguredProviders]);

    return (
        <Setting
            slots={{
                name: 'AI model',
                desc: description,
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

/**
 * Task 7.4: Test connection button for active provider
 */
function TestConnectionButton() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [modelsLoaded, setModelsLoaded] = useState<number>(0);

    const activeProvider = settings.ai?.activeProvider ?? 'anthropic';
    const aiEnabled = settings.ai?.enabled ?? false;
    const currentModel = settings.ai?.model ?? '';
    const apiKey = settings.ai?.providers?.[activeProvider]?.apiKey ?? '';
    const baseUrl = settings.ai?.providers?.['openai-compatible']?.baseUrl
        ?? DEFAULT_SETTINGS.ai.providers['openai-compatible'].baseUrl;

    const requiresApiKey = activeProvider !== 'openai-compatible';

    const providerInfo = PROVIDER_INFO[activeProvider];

    const handleTestConnection = useCallback(async () => {
        if (requiresApiKey && !apiKey) {
            setTestStatus('error');
            setErrorMessage(`Please enter a ${providerInfo.displayName} API key first.`);
            return;
        }

        setTestStatus('testing');
        setErrorMessage('');
        setModelsLoaded(0);

        try {
            const provider = await getProvider(activeProvider);
            const result = await provider.testConnection(apiKey, activeProvider === 'openai-compatible' ? baseUrl : undefined);

            if (result.success && result.models) {
                // Convert to AIModelInfo format
                const modelInfos: AIModelInfo[] = result.models.map(m => ({
                    id: m.id,
                    displayName: m.displayName,
                }));

                // Save the fetched models to the active provider
                await settingsManager.updateAIProviderAvailableModels(activeProvider, modelInfos);
                setModelsLoaded(result.models.length);

                // Auto-select first model from this provider if none selected
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
            const message = err instanceof Error ? err.message : 'Unknown error';
            setErrorMessage(`${providerInfo.displayName}: ${message}`);
        }

        // Reset status after 5 seconds
        setTimeout(() => {
            setTestStatus('idle');
            setErrorMessage('');
            setModelsLoaded(0);
        }, 5000);
    }, [apiKey, activeProvider, currentModel, settingsManager, providerInfo, baseUrl, requiresApiKey]);

    const getStatusText = () => {
        switch (testStatus) {
            case 'testing': return `Testing ${providerInfo.displayName}...`;
            case 'success':
                if (activeProvider === 'openai-compatible') {
                    return `Connected to ${baseUrl}. ${modelsLoaded} models loaded.`;
                }
                return `${providerInfo.displayName} connected! ${modelsLoaded} models loaded.`;
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
                        Verify your {providerInfo.displayName} API key and fetch available models.
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
            disabled={!aiEnabled || (requiresApiKey && !apiKey) || testStatus === 'testing'}
        />
    );
}

/**
 * Task 7.6: Provider status indicators
 */
function ProviderStatusSetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const aiEnabled = settings.ai?.enabled ?? false;
    const providers = settings.ai?.providers ?? DEFAULT_SETTINGS.ai.providers;

    const statusItems = useMemo(() => {
        return PROVIDER_ORDER.map(provider => {
            const providerSettings = providers[provider];
            const hasKey = !!providerSettings?.apiKey;
            const hasModels = (providerSettings?.availableModels?.length ?? 0) > 0;
            const info = PROVIDER_INFO[provider];
            // openai-compatible doesn't require API key
            const isConfigured = hasKey || provider === 'openai-compatible';

            let status: 'configured' | 'warning' | 'none';
            let statusIcon: string;
            let statusColor: string;
            let statusTooltip: string;

            if (isConfigured && hasModels) {
                status = 'configured';
                statusIcon = '\u2713'; // checkmark
                statusColor = 'var(--color-green)';
                statusTooltip = provider === 'openai-compatible' 
                    ? 'Connected and tested' 
                    : 'API key configured and tested';
            } else if (isConfigured && !hasModels) {
                status = 'warning';
                statusIcon = '\u26A0'; // warning triangle
                statusColor = 'var(--color-yellow)';
                statusTooltip = provider === 'openai-compatible'
                    ? 'Not tested - click Test Connection'
                    : 'API key set but not tested';
            } else {
                status = 'none';
                statusIcon = '\u2014'; // em dash
                statusColor = 'var(--text-muted)';
                statusTooltip = 'No API key configured';
            }

            return {
                provider,
                displayName: info.displayName,
                status,
                statusIcon,
                statusColor,
                statusTooltip,
            };
        });
    }, [providers]);

    return (
        <Setting
            slots={{
                name: 'Provider status',
                desc: (
                    <div style={{ marginTop: '0.5em' }}>
                        {statusItems.map(item => (
                            <div
                                key={item.provider}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5em',
                                    marginBottom: '0.3em',
                                }}
                                title={item.statusTooltip}
                            >
                                <span style={{
                                    color: item.statusColor,
                                    fontWeight: 'bold',
                                    width: '1.5em',
                                    textAlign: 'center',
                                }}>
                                    {item.statusIcon}
                                </span>
                                <span>{item.displayName}</span>
                            </div>
                        ))}
                    </div>
                ),
                control: null
            }}
            disabled={!aiEnabled}
        />
    );
}

function LoadedModelsSetting() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const aiEnabled = settings.ai?.enabled ?? false;
    const ollamaModels = settings.ai?.providers?.['openai-compatible']?.availableModels ?? [];

    if (ollamaModels.length === 0) {
        return null;
    }

    return (
        <Setting
            slots={{
                name: 'Loaded Ollama models',
                desc: (
                    <div style={{ marginTop: '0.5em' }}>
                        {ollamaModels.map((model: { id: string; displayName: string }) => (
                            <div
                                key={model.id}
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.85em',
                                    padding: '2px 0',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                {model.id} → {model.displayName}
                            </div>
                        ))}
                    </div>
                ),
                control: null
            }}
            disabled={!aiEnabled}
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
                <ProviderSelectionSetting />
                <BaseURLSetting />
                <APIKeySetting />
                <TestConnectionButton />
                <ProviderStatusSetting />
            </Setting.Container>
            <h2>Advanced</h2>
            <Setting.Container>
                <LoadedModelsSetting />
                <MaxTokensSetting />
            </Setting.Container>
            <h2>Custom Prompt Configuration</h2>
            <div style={{ marginBottom: '1em', color: 'var(--text-muted)', fontSize: '0.9em' }}>
                <p style={{ marginBottom: '0.5em' }}>
                    You can customize the AI system prompt and JSON schema by editing the plugin's <code>data.json</code> file directly.
                    This allows advanced customization of AI behavior without modifying source code.
                </p>
                <p style={{ marginBottom: '0.5em' }}>
                    <strong>Available settings in <code>data.json</code> → <code>ai</code>:</strong>
                </p>
                <ul style={{ marginLeft: '1.5em', marginBottom: '0.5em' }}>
                    <li><code>customSystemPrompt</code> - Custom system prompt text (optional)</li>
                    <li><code>customJsonSchema</code> - Custom JSON schema as a string (optional)</li>
                </ul>
                <p style={{ marginBottom: '0.5em' }}>
                    <strong>Placeholder substitution:</strong> If your <code>customSystemPrompt</code> contains the placeholder{' '}
                    <code>{'{{JSON_SCHEMA}}'}</code>, it will be automatically replaced with the prettified content of{' '}
                    <code>customJsonSchema</code> at runtime.
                </p>
                <p style={{ color: 'var(--text-faint)' }}>
                    Note: Model selection is available in the AI agent window on the canvas, not in these settings.
                </p>
            </div>
        </>
    );
}

// Export individual components for testing and reuse
export {
    AIEnabledSetting,
    ProviderSelectionSetting,
    BaseURLSetting,
    APIKeySetting,
    ModelSelectionSetting,
    TestConnectionButton,
    ProviderStatusSetting,
    MaxTokensSetting,
    PROVIDER_INFO,
    PROVIDER_ORDER,
};
