import React, { useCallback } from "react";
import Setting from "./Setting";
import useSettingsManager from "src/hooks/useSettingsManager";
import { DEFAULT_SETTINGS } from "src/obsidian/TldrawSettingsTab";
import useUserPluginSettings from "src/hooks/useUserPluginSettings";

export default function EditorSettings() {
    const manager = useSettingsManager();
    const settings = useUserPluginSettings(manager);

    const onLayerPanelEnabledChanged = useCallback(async (value: boolean) => {
        if (!manager.settings.layerPanel) {
            manager.settings.layerPanel = {};
        }
        manager.settings.layerPanel.enabled = value;
        await manager.updateSettings(manager.settings);
    }, [manager]);

    const onLayerPanelDefaultCollapsedChanged = useCallback(async (value: boolean) => {
        if (!manager.settings.layerPanel) {
            manager.settings.layerPanel = {};
        }
        manager.settings.layerPanel.defaultCollapsed = value;
        await manager.updateSettings(manager.settings);
    }, [manager]);

    const layerPanelEnabled = settings.layerPanel?.enabled ?? DEFAULT_SETTINGS.layerPanel.enabled;
    const layerPanelDefaultCollapsed = settings.layerPanel?.defaultCollapsed ?? DEFAULT_SETTINGS.layerPanel.defaultCollapsed;

    return (
        <>
            <Setting.Container>
                <Setting
                    heading={true}
                    slots={{
                        name: 'Layer Panel'
                    }}
                />
                <Setting
                    slots={{
                        name: 'Enable layer panel',
                        desc: (
                            <>
                                Show a panel that displays all shapes on the canvas, allowing you to select, rename, and toggle visibility of shapes.
                                <code className="ptl-default-code">
                                    DEFAULT: {DEFAULT_SETTINGS.layerPanel.enabled ? 'On' : 'Off'}
                                </code>
                            </>
                        ),
                        control: (
                            <>
                                <Setting.Toggle
                                    value={layerPanelEnabled}
                                    onChange={onLayerPanelEnabledChanged}
                                />
                            </>
                        )
                    }}
                />
                <Setting
                    slots={{
                        name: 'Start collapsed',
                        desc: (
                            <>
                                When enabled, the layer panel will start in a collapsed state.
                                <code className="ptl-default-code">
                                    DEFAULT: {DEFAULT_SETTINGS.layerPanel.defaultCollapsed ? 'On' : 'Off'}
                                </code>
                            </>
                        ),
                        info: layerPanelEnabled ? <></> : (
                            <>
                                <p style={{ color: 'var(--color-yellow)' }}>Enable the layer panel above to change this setting</p>
                            </>
                        ),
                        control: (
                            <>
                                <Setting.Toggle
                                    value={layerPanelDefaultCollapsed}
                                    onChange={onLayerPanelDefaultCollapsedChanged}
                                />
                            </>
                        )
                    }}
                    disabled={!layerPanelEnabled}
                />
            </Setting.Container>
        </>
    );
}
