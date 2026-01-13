import TldrawPlugin from "src/main";
import { AIModelInfo, AISettings, DEFAULT_SETTINGS, DEFAULT_AI_PROVIDER_SETTINGS, FileDestinationsSettings, TldrawPluginSettings, UserTLCameraOptions } from "../TldrawSettingsTab";
import type { AgentModelProvider } from "src/ai/models";

type UserTldrawOptions = NonNullable<TldrawPluginSettings['tldrawOptions']>;

export default class UserSettingsManager {
    #plugin: TldrawPlugin;
    #subscribers = new Set<() => void>();
    #store = {
        subscribe: (cb: () => void) => {
            this.#subscribers.add(cb);
            return () => this.#subscribers.delete(cb);
        },
        get: (): TldrawPluginSettings => this.#plugin.settings
    };

    constructor(plugin: TldrawPlugin) {
        this.#plugin = plugin;
    }

    get settings() { return this.#plugin.settings; }
    get store() { return Object.assign({}, this.#store); }
    get plugin() { return this.#plugin }
    get markdownFileTags() {
        if (this.settings.file?.insertTags === false) return [];
        return this.settings.file?.customTags ?? ['tldraw'];
    }

    #notifyStoreSubscribers() {
        this.#subscribers.forEach((e) => e());
    }

    /**
     * Migrate AI settings from the old single-provider format to the new multi-provider format.
     * This handles users upgrading from versions that only supported Anthropic.
     */
    #migrateAISettings(ai: Partial<AISettings> | undefined): AISettings {
        // Start with defaults
        const migratedAI: AISettings = {
            enabled: ai?.enabled ?? DEFAULT_SETTINGS.ai.enabled,
            activeProvider: ai?.activeProvider ?? 'anthropic',
            providers: {
                anthropic: { ...DEFAULT_AI_PROVIDER_SETTINGS },
                google: { ...DEFAULT_AI_PROVIDER_SETTINGS },
                openai: { ...DEFAULT_AI_PROVIDER_SETTINGS },
            },
            model: ai?.model ?? DEFAULT_SETTINGS.ai.model,
            showChatPanel: ai?.showChatPanel ?? DEFAULT_SETTINGS.ai.showChatPanel,
            maxTokens: ai?.maxTokens ?? DEFAULT_SETTINGS.ai.maxTokens,
            temperature: ai?.temperature ?? DEFAULT_SETTINGS.ai.temperature,
            // Preserve custom prompt and schema if they exist
            customSystemPrompt: ai?.customSystemPrompt,
            customJsonSchema: ai?.customJsonSchema,
        };

        // Fix invalid model values (like dividers that were accidentally saved)
        if (migratedAI.model && migratedAI.model.startsWith('__divider_')) {
            console.warn(`Invalid model value detected: ${migratedAI.model}, resetting to default`);
            migratedAI.model = DEFAULT_SETTINGS.ai.model;
        }

        // Check if this is an old format (has apiKey but no providers)
        const hasOldFormat = ai && ai.apiKey !== undefined && !ai.providers;

        if (hasOldFormat) {
            // Migrate old apiKey to providers.anthropic.apiKey
            migratedAI.providers.anthropic.apiKey = ai.apiKey ?? '';
            // Migrate old availableModels to providers.anthropic.availableModels
            migratedAI.providers.anthropic.availableModels = ai.availableModels ?? [];
            // Set activeProvider to anthropic since that was the only provider before
            migratedAI.activeProvider = 'anthropic';
        } else if (ai?.providers) {
            // New format - merge with defaults
            migratedAI.providers = {
                anthropic: {
                    apiKey: ai.providers.anthropic?.apiKey ?? '',
                    availableModels: ai.providers.anthropic?.availableModels ?? [],
                },
                google: {
                    apiKey: ai.providers.google?.apiKey ?? '',
                    availableModels: ai.providers.google?.availableModels ?? [],
                },
                openai: {
                    apiKey: ai.providers.openai?.apiKey ?? '',
                    availableModels: ai.providers.openai?.availableModels ?? [],
                },
            };
        }

        return migratedAI;
    }

    async loadSettings() {
        // We destructure the defaults for nested properties, e.g `embeds`, so that we can merge them separately since Object.assign does not merge nested properties.
        const {
            embeds: embedsDefault,
            fileDestinations: fileDestinationsDefault,
            file: fileDefault,
            layerPanel: layerPanelDefault,
            ai: _aiDefault, // We handle AI migration separately
            ...restDefault
        } = DEFAULT_SETTINGS;
        const {
            embeds,
            fileDestinations,
            tldrawOptions,
            file,
            layerPanel,
            ai,
            ...rest
        } = await this.#plugin.loadData() as Partial<TldrawPluginSettings> || {};

        const embedsMerged = Object.assign({}, embedsDefault, embeds);

        const fileMerged = Object.assign(
            {}, fileDefault, file
        );

        const layerPanelMerged = Object.assign({}, layerPanelDefault, layerPanel);

        // Use the migration helper for AI settings
        const aiMerged = this.#migrateAISettings(ai);

        const fileDestinationsMerged = Object.assign({}, fileDestinationsDefault,
            (() => {
                // Do not migrate if the the old file destination settings were already migrated.
                if (fileDestinations === undefined) return {};
                // Migrate old settings
                const migrated: Partial<FileDestinationsSettings> = {};

                if (rest.folder !== undefined) {
                    migrated.defaultFolder = rest.folder;
                }

                if (rest.assetsFolder !== undefined) {
                    migrated.assetsFolder = rest.assetsFolder;
                }

                if (rest.useAttachmentsFolder !== undefined && rest.useAttachmentsFolder) {
                    migrated.destinationMethod = 'attachments-folder';
                }
            })(),
            fileDestinations,
        );
        delete rest.folder;
        delete rest.assetsFolder;
        delete rest.useAttachmentsFolder;
        const restMerged = Object.assign({}, restDefault, rest);

        const settings = {
            embeds: embedsMerged,
            fileDestinations: fileDestinationsMerged,
            tldrawOptions,
            file: fileMerged,
            layerPanel: layerPanelMerged,
            ai: aiMerged,
            ...restMerged
        };

        if (settings.fonts?.overrides) {
            /**
             * Migrate the old font overrides to the new format.
             */

            const { draw, monospace, sansSerif, serif } = settings.fonts.overrides;


            if (!settings.fonts.overrides.tldraw_draw) {
                settings.fonts.overrides.tldraw_draw = draw;
            }

            if (!settings.fonts.overrides.tldraw_mono) {
                settings.fonts.overrides.tldraw_mono = monospace;
            }

            if (!settings.fonts.overrides.tldraw_sans) {
                settings.fonts.overrides.tldraw_sans = sansSerif;
            }

            if (!settings.fonts.overrides.tldraw_serif) {
                settings.fonts.overrides.tldraw_serif = serif;
            }

            delete settings.fonts.overrides?.draw;
            delete settings.fonts.overrides?.monospace;
            delete settings.fonts.overrides?.sansSerif;
            delete settings.fonts.overrides?.serif;
        }

        this.#plugin.settings = settings;

        this.#notifyStoreSubscribers();
    }

    async updateSettings(settings: TldrawPluginSettings) {
        this.#plugin.settings = Object.assign({}, settings);
        await this.#plugin.saveSettings();
        this.#notifyStoreSubscribers();
    }

    async updateLaserDelayMs(delayMs: UserTldrawOptions['laserDelayMs']) {
        let tldrawOptions = this.#plugin.settings.tldrawOptions;
        if (delayMs === tldrawOptions?.laserDelayMs) return;
        if (delayMs === undefined) {
            delete tldrawOptions?.laserDelayMs;
        } else {
            if (!tldrawOptions) tldrawOptions = {};
            tldrawOptions.laserDelayMs = delayMs;
        }
        this.#plugin.settings.tldrawOptions = Object.assign({}, tldrawOptions);
        this.updateSettings(this.#plugin.settings);
    }

    async updateLaserKeepDelayAfterStop(keepDelay: UserTldrawOptions['laserKeepDelayAfterStop']) {
        let tldrawOptions = this.#plugin.settings.tldrawOptions;
        if (keepDelay === tldrawOptions?.laserKeepDelayAfterStop) return;
        if (keepDelay === undefined) {
            delete tldrawOptions?.laserKeepDelayAfterStop;
        } else {
            if (!tldrawOptions) tldrawOptions = {};
            tldrawOptions.laserKeepDelayAfterStop = keepDelay;
        }
        this.#plugin.settings.tldrawOptions = Object.assign({}, tldrawOptions);
        this.updateSettings(this.#plugin.settings);
    }

    async updateEditorWheelBehavior(wheelBehavior: UserTLCameraOptions['wheelBehavior']) {
        let options = this.#plugin.settings.cameraOptions;
        if (wheelBehavior === options?.wheelBehavior) return;
        if (wheelBehavior === undefined) {
            delete options?.wheelBehavior;
        } else {
            if (!options) options = {};
            options.wheelBehavior = wheelBehavior;
        }
        this.#plugin.settings.cameraOptions = Object.assign({}, options);
        this.updateSettings(this.#plugin.settings);
    }

    async updatePasteAtCursor(pasteAtCursor: NonNullable<TldrawPluginSettings['clipboard']>['pasteAtCursor']) {
        let options = this.#plugin.settings.clipboard;
        if (pasteAtCursor === options?.pasteAtCursor) return;
        if (pasteAtCursor === undefined) {
            delete options?.pasteAtCursor;
        } else {
            if (!options) options = {};
            options.pasteAtCursor = pasteAtCursor;
        }
        this.#plugin.settings.clipboard = Object.assign({}, options);
        this.updateSettings(this.#plugin.settings);
    }

    async updateNoteResizable(noteResizable: UserTldrawOptions['noteResizable']) {
        let tldrawOptions = this.#plugin.settings.tldrawOptions;
        if (noteResizable === tldrawOptions?.noteResizable) return;
        if (noteResizable === undefined) {
            delete tldrawOptions?.noteResizable;
        } else {
            if (!tldrawOptions) tldrawOptions = {};
            tldrawOptions.noteResizable = noteResizable;
        }
        this.#plugin.settings.tldrawOptions = Object.assign({}, tldrawOptions);
        this.updateSettings(this.#plugin.settings);
    }

    async updateDefaultFill(defaultFill: UserTldrawOptions['defaultFill']) {
        let tldrawOptions = this.#plugin.settings.tldrawOptions;
        if (defaultFill === tldrawOptions?.defaultFill) return;
        if (defaultFill === undefined) {
            delete tldrawOptions?.defaultFill;
        } else {
            if (!tldrawOptions) tldrawOptions = {};
            tldrawOptions.defaultFill = defaultFill;
        }
        this.#plugin.settings.tldrawOptions = Object.assign({}, tldrawOptions);
        this.updateSettings(this.#plugin.settings);
    }

    async updateDefaultDash(defaultDash: UserTldrawOptions['defaultDash']) {
        let tldrawOptions = this.#plugin.settings.tldrawOptions;
        if (defaultDash === tldrawOptions?.defaultDash) return;
        if (defaultDash === undefined) {
            delete tldrawOptions?.defaultDash;
        } else {
            if (!tldrawOptions) tldrawOptions = {};
            tldrawOptions.defaultDash = defaultDash;
        }
        this.#plugin.settings.tldrawOptions = Object.assign({}, tldrawOptions);
        this.updateSettings(this.#plugin.settings);
    }

    async updateDefaultSize(defaultSize: UserTldrawOptions['defaultSize']) {
        let tldrawOptions = this.#plugin.settings.tldrawOptions;
        if (defaultSize === tldrawOptions?.defaultSize) return;
        if (defaultSize === undefined) {
            delete tldrawOptions?.defaultSize;
        } else {
            if (!tldrawOptions) tldrawOptions = {};
            tldrawOptions.defaultSize = defaultSize;
        }
        this.#plugin.settings.tldrawOptions = Object.assign({}, tldrawOptions);
        this.updateSettings(this.#plugin.settings);
    }

    async updateStrokeSizes(strokeSizes: UserTldrawOptions['strokeSizes']) {
        let tldrawOptions = this.#plugin.settings.tldrawOptions;
        if (JSON.stringify(strokeSizes) === JSON.stringify(tldrawOptions?.strokeSizes)) return;
        if (strokeSizes === undefined) {
            delete tldrawOptions?.strokeSizes;
        } else {
            if (!tldrawOptions) tldrawOptions = {};
            tldrawOptions.strokeSizes = strokeSizes;
        }
        this.#plugin.settings.tldrawOptions = Object.assign({}, tldrawOptions);
        this.updateSettings(this.#plugin.settings);
    }

    // AI Settings Methods

    #ensureAISettings(): AISettings {
        if (!this.#plugin.settings.ai) {
            this.#plugin.settings.ai = this.#migrateAISettings(undefined);
        }
        return this.#plugin.settings.ai;
    }

    async updateAIEnabled(enabled: AISettings['enabled']) {
        const aiSettings = this.#ensureAISettings();
        if (enabled === aiSettings.enabled) return;
        aiSettings.enabled = enabled;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    /**
     * @deprecated Use `updateAIProviderApiKey('anthropic', apiKey)` instead.
     * This method is kept for backward compatibility and delegates to the new provider-specific method.
     */
    async updateAIApiKey(apiKey: string) {
        // Delegate to the new provider-specific method, defaulting to anthropic
        await this.updateAIProviderApiKey('anthropic', apiKey);
    }

    async updateAIModel(model: string) {
        const aiSettings = this.#ensureAISettings();
        if (model === aiSettings.model) return;
        aiSettings.model = model;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    /**
     * @deprecated Use `updateAIProviderAvailableModels('anthropic', models)` instead.
     * This method is kept for backward compatibility and delegates to the new provider-specific method.
     */
    async updateAIAvailableModels(models: AIModelInfo[]) {
        // Delegate to the new provider-specific method, defaulting to anthropic
        await this.updateAIProviderAvailableModels('anthropic', models);
    }

    async updateAIShowChatPanel(showChatPanel: AISettings['showChatPanel']) {
        const aiSettings = this.#ensureAISettings();
        if (showChatPanel === aiSettings.showChatPanel) return;
        aiSettings.showChatPanel = showChatPanel;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    async updateAIMaxTokens(maxTokens: AISettings['maxTokens']) {
        const aiSettings = this.#ensureAISettings();
        if (maxTokens === aiSettings.maxTokens) return;
        aiSettings.maxTokens = maxTokens;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    // New Multi-Provider AI Settings Methods

    /**
     * Update the active AI provider.
     * @param provider - The provider to set as active ('anthropic', 'google', or 'openai')
     */
    async updateAIActiveProvider(provider: AgentModelProvider) {
        const aiSettings = this.#ensureAISettings();
        if (provider === aiSettings.activeProvider) return;
        aiSettings.activeProvider = provider;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    /**
     * Update the API key for a specific provider.
     * @param provider - The provider to update
     * @param apiKey - The API key to set
     */
    async updateAIProviderApiKey(provider: AgentModelProvider, apiKey: string) {
        const aiSettings = this.#ensureAISettings();
        if (apiKey === aiSettings.providers[provider].apiKey) return;
        aiSettings.providers[provider] = {
            ...aiSettings.providers[provider],
            apiKey,
        };
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    /**
     * Update the available models for a specific provider.
     * @param provider - The provider to update
     * @param models - The models fetched from the provider's API
     */
    async updateAIProviderAvailableModels(provider: AgentModelProvider, models: AIModelInfo[]) {
        const aiSettings = this.#ensureAISettings();
        aiSettings.providers[provider] = {
            ...aiSettings.providers[provider],
            availableModels: models,
        };
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    /**
     * Get the API key for a specific provider.
     * @param provider - The provider to get the API key for
     * @returns The API key, or empty string if not set
     */
    getAIProviderApiKey(provider: AgentModelProvider): string {
        const aiSettings = this.#plugin.settings.ai;
        return aiSettings?.providers?.[provider]?.apiKey ?? '';
    }

    /**
     * Get the available models for a specific provider.
     * @param provider - The provider to get models for
     * @returns The available models, or empty array if not set
     */
    getAIProviderAvailableModels(provider: AgentModelProvider): AIModelInfo[] {
        const aiSettings = this.#plugin.settings.ai;
        return aiSettings?.providers?.[provider]?.availableModels ?? [];
    }

    // Custom Prompt and Schema Settings Methods

    /**
     * Update the custom system prompt.
     * @param prompt - The custom system prompt to use, or undefined to clear
     */
    async updateAICustomSystemPrompt(prompt: string | undefined) {
        const aiSettings = this.#ensureAISettings();
        if (prompt === aiSettings.customSystemPrompt) return;
        if (prompt === undefined) {
            delete aiSettings.customSystemPrompt;
        } else {
            aiSettings.customSystemPrompt = prompt;
        }
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    /**
     * Update the custom JSON schema.
     * @param schema - The custom JSON schema string to use, or undefined to clear
     */
    async updateAICustomJsonSchema(schema: string | undefined) {
        const aiSettings = this.#ensureAISettings();
        if (schema === aiSettings.customJsonSchema) return;
        if (schema === undefined) {
            delete aiSettings.customJsonSchema;
        } else {
            aiSettings.customJsonSchema = schema;
        }
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }
}
