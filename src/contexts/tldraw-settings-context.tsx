import React, { createContext, useContext, useMemo } from "react";
import { TldrawPluginSettings } from "src/obsidian/TldrawSettingsTab";
import UserSettingsManager from "src/obsidian/settings/UserSettingsManager";
import useUserPluginSettings from "src/hooks/useUserPluginSettings";

interface TldrawSettingsContextValue {
	settings: TldrawPluginSettings;
	settingsManager: UserSettingsManager;
}

const TldrawSettingsContext = createContext<TldrawSettingsContextValue | undefined>(undefined);

export function TldrawSettingsProvider({
	children,
	settingsManager,
}: {
	children: React.ReactNode;
	settingsManager: UserSettingsManager;
}) {
	const settings = useUserPluginSettings(settingsManager);

	const value = useMemo(
		() => ({ settings, settingsManager }),
		[settings, settingsManager]
	);

	return (
		<TldrawSettingsContext.Provider value={value}>
			{children}
		</TldrawSettingsContext.Provider>
	);
}

export function useTldrawSettings() {
	const context = useContext(TldrawSettingsContext);
	if (!context) {
		throw new Error("useTldrawSettings must be used within TldrawSettingsProvider");
	}
	return context;
}

export function useSettings() {
	return useTldrawSettings().settings;
}
