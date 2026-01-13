import TldrawPlugin from "../main";
import {
	App,
	PluginSettingTab,
} from "obsidian";
import { FontOverrides, IconOverrides } from "src/types/tldraw";
import { TLCameraOptions, TldrawOptions } from "tldraw";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import TldrawSettingsTabView from "src/components/settings/TldrawSettingsTabView";
import { destinationMethods, themePreferenceRecord } from "./settings/constants";
import { VIEW_TYPE_TLDRAW, ViewType } from "src/utils/constants";
import type { AgentModelProvider } from "src/ai/models";

export type ThemePreference = keyof typeof themePreferenceRecord;

export type DestinationMethod = typeof destinationMethods[number];

export type FileDestinationsSettings = {
	/**
	 * The location where tldraw assets will be downloaded in
	 */
	assetsFolder: string;
	/**
	 * Whether to show an input to confirm the path of the new file.
	 *
	 * By default, the input will be filled in with the path defined by {@linkcode FileDestinationsSettings.destinationMethod}
	 *
	 * The modal will also show the following options:
	 *
	 * - Colocate file, if there is an active file view
	 * - Default attachment folder as defined in the Obsidian settings
	 * - {@linkcode FileDestinationsSettings.defaultFolder}
	 */
	confirmDestination: boolean;
	/**
	 * The default folder to save new tldraw files in.
	 */
	defaultFolder: string,
	/**
	 *
	 * # `colocate`
	 * If this is true then create new tldraw files in the same folder as the active note or file view.
	 *
	 * If there is no active note or file view, then root directory is used.
	 *
	 * # `attachments-folder`
	 * Use the attachments folder defined in the Obsidian "Files and links" settings.
	 *
	 */
	destinationMethod: DestinationMethod,
	/**
	 * When the colocate destination method is used, this folder will be used as its subfolder.
	 */
	colocationSubfolder: string,
};

/**
 * These are old settings, the properties have been marked as deprecated to assist the programmer migrate these settings.
 */
type DeprecatedFileDestinationSettings = {
	/**
	 * @deprecated Migrate to {@linkcode TldrawPluginSettings.fileDestinations}
	 * The location where tldraw assets will be downloaded in
	 */
	assetsFolder?: string;
	/**
	 * @deprecated Migrate to {@linkcode TldrawPluginSettings.fileDestinations}
	 */
	folder?: string;
	/**
	 * @deprecated Migrate to {@linkcode TldrawPluginSettings.fileDestinations}
	 * Use the attachments folder defined in the Obsidian "Files and links" settings.
	 */
	useAttachmentsFolder?: boolean;
};

type RemoveReadonly<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Camera options that users can choose
 */
export type UserTLCameraOptions = Pick<Partial<TLCameraOptions>, 'panSpeed' | 'zoomSpeed' | 'zoomSteps' | 'wheelBehavior'>;

/**
 * tldraw views, but for the `.md` extension
 */
type MarkdownViewType = ViewType

/**
 * Model information fetched from provider API
 */
export type AIModelInfo = {
	id: string;
	displayName: string;
};

/**
 * Per-provider settings including API key and available models
 */
export type AIProviderSettings = {
	/** API key for this provider */
	apiKey: string;
	/** Available models fetched from this provider's API */
	availableModels: AIModelInfo[];
};

/**
 * AI assistant settings with multi-provider support
 */
export type AISettings = {
	/** Whether AI features are enabled */
	enabled: boolean;
	/** The currently active AI provider */
	activeProvider: AgentModelProvider;
	/** Per-provider settings (API keys and models) */
	providers: {
		anthropic: AIProviderSettings;
		google: AIProviderSettings;
		openai: AIProviderSettings;
	};
	/** Selected AI model ID (e.g., 'claude-sonnet-4-20250514') */
	model: string;
	/** Whether to show the chat panel by default */
	showChatPanel: boolean;
	/** Maximum tokens for AI responses */
	maxTokens: number;
	/** Temperature for AI responses (0-1). Lower = more deterministic. Not supported by all models. */
	temperature: number;

	/**
	 * Custom system prompt to use instead of the default.
	 * When set and non-empty, this prompt is used for AI interactions.
	 * Stored in data.json to keep IPR-protected content out of git.
	 */
	customSystemPrompt?: string;
	/**
	 * Custom JSON schema to use instead of the default.
	 * Should be a valid JSON string representing the response schema.
	 * Stored in data.json to keep IPR-protected content out of git.
	 */
	customJsonSchema?: string;

	/**
	 * @deprecated Use `providers.anthropic.apiKey` instead. Kept for migration compatibility.
	 */
	apiKey?: string;
	/**
	 * @deprecated Use `providers[activeProvider].availableModels` instead. Kept for migration compatibility.
	 */
	availableModels?: AIModelInfo[];
};

export interface TldrawPluginSettings extends DeprecatedFileDestinationSettings {
	fileDestinations: FileDestinationsSettings;
	saveFileDelay: number; // in seconds
	newFilePrefix: string;
	newFileTimeFormat: string;
	toolSelected: string;
	themeMode: ThemePreference;
	gridMode: boolean;
	snapMode: boolean;
	debugMode: boolean;
	focusMode: boolean;
	fonts?: {
		overrides?: FontOverrides
	},
	icons?: {
		overrides?: IconOverrides
	}
	embeds: {
		padding: number;
		/**
		 * Default value to control whether to show the background for markdown embeds
		 */
		showBg: boolean
		/**
		 * Default value to control whether to show the background dotted pattern for markdown embeds
		 */
		showBgDots: boolean;
	};
	/**
	 * Options that apply to the editor
	 */
	tldrawOptions?: Pick<Partial<RemoveReadonly<TldrawOptions>>, 'laserDelayMs'> & {
		/**
		 * When the laser tool is stopped, whether to keep the delay defined by `laserDelayMs`
		 */
		laserKeepDelayAfterStop?: boolean,
		/**
		 * Whether note shapes can be resized by the user
		 */
		noteResizable?: boolean,
		/**
		 * Default fill style for new shapes
		 */
		defaultFill?: 'none' | 'semi' | 'solid' | 'pattern',
		/**
		 * Default dash style for new shapes
		 */
		defaultDash?: 'draw' | 'solid' | 'dashed' | 'dotted',
		/**
		 * Default size for new shapes
		 */
		defaultSize?: 's' | 'm' | 'l' | 'xl',
		/**
		 * Custom stroke size values (overrides tldraw defaults)
		 */
		strokeSizes?: {
			s: number,
			m: number,
			l: number,
			xl: number,
		},
	}
	/**
	 * Options that apply to the editor camera
	 */
	cameraOptions?: UserTLCameraOptions,
	clipboard?: {
		pasteAtCursor?: boolean,
	}
	workspace: {
		/**
		 * Tldraw markdown files (with the `.md` extension) will open as this type when clicked on.
		 */
		tldrMarkdownViewType: MarkdownViewType,
		/**
		 * Enable switching to `tldrMarkdownViewType` when opening a tldraw markdown file.
		 */
		switchMarkdownView: boolean,
	}
	file?: {
		/**
		 * The alternative frontmatter key used to detect if the markdown file is a tldraw document.
		 *
		 * {@linkcode FRONTMATTER_KEY} will always be detected as a tldraw document even with this defined.
		 */
		altFrontmatterKey?: string,
		/**
		 * Insert tags in the frontmatter when creating a new document.
		 */
		insertTags?: boolean,
		/**
		 * Insert these tags in the frontmatter when creating a new document.
		 */
		customTags?: string[],
	}
	layerPanel?: {
		/** Whether the layer panel is enabled */
		enabled?: boolean;
		/** Whether the panel starts collapsed */
		defaultCollapsed?: boolean;
	}
	/**
	 * Settings for managing image and SVG assets
	 */
	assets?: {
		/**
		 * Template for naming image files when pasted or dropped into tldraw.
		 * Supports variables: {notename}, {imagename}, {date:FORMAT}, {timestamp}, {uuid}, {uuid:short}
		 */
		imageNameTemplate?: string;
	}
	/**
	 * UI customization options
	 */
	ui?: {
		/**
		 * Force the compact (mobile) UI mode even on desktop.
		 * This provides a more streamlined interface with smaller controls.
		 */
		forceCompactMode?: boolean;
	}
	/**
	 * AI assistant settings
	 */
	ai?: AISettings;
}

/**
 * Default settings for the AI providers structure
 */
export const DEFAULT_AI_PROVIDER_SETTINGS: AIProviderSettings = {
	apiKey: '',
	availableModels: [],
};

export const DEFAULT_SETTINGS = {
	saveFileDelay: 0.5,
	newFilePrefix: "Tldraw ",
	newFileTimeFormat: "YYYY-MM-DD h.mmA",
	toolSelected: "select",
	themeMode: "light",
	gridMode: false,
	snapMode: false,
	debugMode: false,
	focusMode: false,
	fileDestinations: {
		confirmDestination: true,
		assetsFolder: "tldraw/assets",
		destinationMethod: "colocate",
		defaultFolder: "tldraw",
		colocationSubfolder: "",
	},
	embeds: {
		padding: 0,
		showBg: true,
		showBgDots: true,
	},
	workspace: {
		tldrMarkdownViewType: VIEW_TYPE_TLDRAW,
		switchMarkdownView: true,
	},
	file: {
		insertTags: true,
	},
	layerPanel: {
		enabled: false,
		defaultCollapsed: true,
	},
	assets: {
		imageNameTemplate: '{uuid:short}-{imagename}',
	},
	ui: {
		forceCompactMode: false,
	},
	ai: {
		enabled: false,
		activeProvider: 'anthropic' as AgentModelProvider,
		providers: {
			anthropic: { ...DEFAULT_AI_PROVIDER_SETTINGS },
			google: { ...DEFAULT_AI_PROVIDER_SETTINGS },
			openai: { ...DEFAULT_AI_PROVIDER_SETTINGS },
		},
		model: '',
		showChatPanel: false,
		maxTokens: 4096,
		temperature: 0,
		// Deprecated fields kept for migration compatibility
		apiKey: '',
		availableModels: [],
	},
} as const satisfies Partial<TldrawPluginSettings>;

export class TldrawSettingsTab extends PluginSettingTab {
	plugin: TldrawPlugin;
	#root?: Root;

	constructor(app: App, plugin: TldrawPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		this.#root?.unmount();
		const root = this.#root = createRoot(containerEl);
		root.render(createElement(TldrawSettingsTabView, {
			settingsManager: this.plugin.settingsManager,
		}));
	}

	hide() {
		super.hide();
		this.#root?.unmount();
	}
}
