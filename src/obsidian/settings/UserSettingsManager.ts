import TldrawPlugin from "src/main";
import { AIModelInfo, AISettings, DEFAULT_SETTINGS, FileDestinationsSettings, TldrawPluginSettings, UserTLCameraOptions } from "../TldrawSettingsTab";

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

    async loadSettings() {
        // We destructure the defaults for nested properties, e.g `embeds`, so that we can merge them separately since Object.assign does not merge nested properties.
        const {
            embeds: embedsDefault,
            fileDestinations: fileDestinationsDefault,
            file: fileDefault,
            layerPanel: layerPanelDefault,
            ai: aiDefault,
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

        const aiMerged = Object.assign({}, aiDefault, ai);

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

    async updateAIEnabled(enabled: AISettings['enabled']) {
        let aiSettings = this.#plugin.settings.ai;
        if (enabled === aiSettings?.enabled) return;
        if (!aiSettings) aiSettings = { ...DEFAULT_SETTINGS.ai };
        aiSettings.enabled = enabled;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    async updateAIApiKey(apiKey: AISettings['apiKey']) {
        let aiSettings = this.#plugin.settings.ai;
        if (apiKey === aiSettings?.apiKey) return;
        if (!aiSettings) aiSettings = { ...DEFAULT_SETTINGS.ai };
        aiSettings.apiKey = apiKey;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    async updateAIModel(model: string) {
        let aiSettings = this.#plugin.settings.ai;
        if (model === aiSettings?.model) return;
        if (!aiSettings) aiSettings = { ...DEFAULT_SETTINGS.ai };
        aiSettings.model = model;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    async updateAIAvailableModels(models: AIModelInfo[]) {
        let aiSettings = this.#plugin.settings.ai;
        if (!aiSettings) aiSettings = { ...DEFAULT_SETTINGS.ai };
        aiSettings.availableModels = models;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    async updateAIShowChatPanel(showChatPanel: AISettings['showChatPanel']) {
        let aiSettings = this.#plugin.settings.ai;
        if (showChatPanel === aiSettings?.showChatPanel) return;
        if (!aiSettings) aiSettings = { ...DEFAULT_SETTINGS.ai };
        aiSettings.showChatPanel = showChatPanel;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }

    async updateAIMaxTokens(maxTokens: AISettings['maxTokens']) {
        let aiSettings = this.#plugin.settings.ai;
        if (maxTokens === aiSettings?.maxTokens) return;
        if (!aiSettings) aiSettings = { ...DEFAULT_SETTINGS.ai };
        aiSettings.maxTokens = maxTokens;
        this.#plugin.settings.ai = Object.assign({}, aiSettings);
        await this.updateSettings(this.#plugin.settings);
    }
}
