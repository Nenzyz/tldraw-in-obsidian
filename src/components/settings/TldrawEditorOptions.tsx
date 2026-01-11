import React, { useCallback } from "react";
import Setting from "./Setting";
import CameraOptionsSettings from "./CameraOptionsSettings";
import useSettingsManager from "src/hooks/useSettingsManager";
import useUserPluginSettings from "src/hooks/useUserPluginSettings";
import { defaultTldrawOptions } from "tldraw";
import { DEFAULT_SETTINGS } from "src/obsidian/TldrawSettingsTab";

function TldrawEditorOptionsGroup() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const onLaserDelayMsChange = useCallback(async (value: string) => {
        const parsedValue = parseInt(value);
        if (Number.isNaN(parsedValue)) return;
        await settingsManager.updateLaserDelayMs(parsedValue);
    }, [settingsManager]);

    const resetLaserDelayMs = useCallback(async () => {
        await settingsManager.updateLaserDelayMs(undefined);
    }, [settingsManager]);

    const onLaserKeepDelay = useCallback(async (value: boolean) => {
        await settingsManager.updateLaserKeepDelayAfterStop(value);
    }, [settingsManager]);

    const resetLaserKeepDelay = useCallback(async () => {
        await settingsManager.updateLaserKeepDelayAfterStop(undefined);
    }, [settingsManager]);

    return (
        <>
            <Setting
                slots={{
                    name: 'Laser delay',
                    desc: 'The delay for the laser tool in milliseconds.',
                    control: (
                        <>
                            <Setting.Text
                                value={`${settings.tldrawOptions?.laserDelayMs ?? ''}`}
                                placeholder={`${defaultTldrawOptions.laserDelayMs}`}
                                onChange={onLaserDelayMsChange}
                            />
                            <Setting.ExtraButton
                                icon={'reset'}
                                tooltip={'reset'}
                                onClick={resetLaserDelayMs}
                            />
                        </>
                    )
                }}
            />
            <Setting
                slots={{
                    name: 'Laser keep delay after stop',
                    desc: 'Keep the laser delay lingering after stopping the laser tool.',
                    control: (
                        <>
                            <Setting.Toggle
                                value={!!settings.tldrawOptions?.laserKeepDelayAfterStop}
                                onChange={onLaserKeepDelay}
                            />
                            <Setting.ExtraButton
                                icon={'reset'}
                                tooltip={'reset'}
                                onClick={resetLaserKeepDelay}
                            />
                        </>
                    )
                }}
            />
        </>
    )
}

const fillOptions: Record<string, string> = {
    none: 'None',
    semi: 'Semi',
    solid: 'Solid',
    pattern: 'Pattern',
};

const dashOptions: Record<string, string> = {
    draw: 'Draw',
    solid: 'Solid',
    dashed: 'Dashed',
    dotted: 'Dotted',
};

const sizeOptions: Record<string, string> = {
    s: 'Small',
    m: 'Medium',
    l: 'Large',
    xl: 'Extra Large',
};

// Default tldraw stroke sizes
const defaultStrokeSizes = { s: 2, m: 3.5, l: 5, xl: 10 };

function ShapeOptionsGroup() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);

    const onNoteResizable = useCallback(async (value: boolean) => {
        await settingsManager.updateNoteResizable(value);
    }, [settingsManager]);

    const resetNoteResizable = useCallback(async () => {
        await settingsManager.updateNoteResizable(undefined);
    }, [settingsManager]);

    const onDefaultFillChange = useCallback(async (value: string) => {
        await settingsManager.updateDefaultFill(value as 'none' | 'semi' | 'solid' | 'pattern');
    }, [settingsManager]);

    const resetDefaultFill = useCallback(async () => {
        await settingsManager.updateDefaultFill(undefined);
    }, [settingsManager]);

    const onDefaultDashChange = useCallback(async (value: string) => {
        await settingsManager.updateDefaultDash(value as 'draw' | 'solid' | 'dashed' | 'dotted');
    }, [settingsManager]);

    const resetDefaultDash = useCallback(async () => {
        await settingsManager.updateDefaultDash(undefined);
    }, [settingsManager]);

    const onDefaultSizeChange = useCallback(async (value: string) => {
        await settingsManager.updateDefaultSize(value as 's' | 'm' | 'l' | 'xl');
    }, [settingsManager]);

    const resetDefaultSize = useCallback(async () => {
        await settingsManager.updateDefaultSize(undefined);
    }, [settingsManager]);

    const currentStrokeSizes = settings.tldrawOptions?.strokeSizes;

    const onStrokeSizeChange = useCallback(async (size: 's' | 'm' | 'l' | 'xl', value: string) => {
        const parsedValue = parseFloat(value);
        if (Number.isNaN(parsedValue) || parsedValue <= 0) return;
        const newSizes = {
            s: currentStrokeSizes?.s ?? defaultStrokeSizes.s,
            m: currentStrokeSizes?.m ?? defaultStrokeSizes.m,
            l: currentStrokeSizes?.l ?? defaultStrokeSizes.l,
            xl: currentStrokeSizes?.xl ?? defaultStrokeSizes.xl,
            [size]: parsedValue,
        };
        await settingsManager.updateStrokeSizes(newSizes);
    }, [settingsManager, currentStrokeSizes]);

    const resetStrokeSizes = useCallback(async () => {
        await settingsManager.updateStrokeSizes(undefined);
    }, [settingsManager]);

    return (
        <>
            <Setting
                slots={{
                    name: 'Note resizable',
                    desc: 'Allow note/comment shapes to be resized by dragging their corners.',
                    control: (
                        <>
                            <Setting.Toggle
                                value={!!settings.tldrawOptions?.noteResizable}
                                onChange={onNoteResizable}
                            />
                            <Setting.ExtraButton
                                icon={'reset'}
                                tooltip={'reset'}
                                onClick={resetNoteResizable}
                            />
                        </>
                    )
                }}
            />
            <Setting
                slots={{
                    name: 'Default fill',
                    desc: 'Default fill style for new shapes.',
                    control: (
                        <>
                            <Setting.Dropdown
                                value={settings.tldrawOptions?.defaultFill ?? 'none'}
                                options={fillOptions}
                                onChange={onDefaultFillChange}
                            />
                            <Setting.ExtraButton
                                icon={'reset'}
                                tooltip={'reset'}
                                onClick={resetDefaultFill}
                            />
                        </>
                    )
                }}
            />
            <Setting
                slots={{
                    name: 'Default dash',
                    desc: 'Default dash/stroke style for new shapes.',
                    control: (
                        <>
                            <Setting.Dropdown
                                value={settings.tldrawOptions?.defaultDash ?? 'draw'}
                                options={dashOptions}
                                onChange={onDefaultDashChange}
                            />
                            <Setting.ExtraButton
                                icon={'reset'}
                                tooltip={'reset'}
                                onClick={resetDefaultDash}
                            />
                        </>
                    )
                }}
            />
            <Setting
                slots={{
                    name: 'Default size',
                    desc: 'Default stroke/line size for new shapes.',
                    control: (
                        <>
                            <Setting.Dropdown
                                value={settings.tldrawOptions?.defaultSize ?? 'm'}
                                options={sizeOptions}
                                onChange={onDefaultSizeChange}
                            />
                            <Setting.ExtraButton
                                icon={'reset'}
                                tooltip={'reset'}
                                onClick={resetDefaultSize}
                            />
                        </>
                    )
                }}
            />
            <Setting
                slots={{
                    name: 'Stroke size (S)',
                    desc: `Small stroke size in pixels. Default: ${defaultStrokeSizes.s}`,
                    control: (
                        <Setting.Text
                            value={`${currentStrokeSizes?.s ?? ''}`}
                            placeholder={`${defaultStrokeSizes.s}`}
                            onChange={(v) => onStrokeSizeChange('s', v)}
                        />
                    )
                }}
            />
            <Setting
                slots={{
                    name: 'Stroke size (M)',
                    desc: `Medium stroke size in pixels. Default: ${defaultStrokeSizes.m}`,
                    control: (
                        <Setting.Text
                            value={`${currentStrokeSizes?.m ?? ''}`}
                            placeholder={`${defaultStrokeSizes.m}`}
                            onChange={(v) => onStrokeSizeChange('m', v)}
                        />
                    )
                }}
            />
            <Setting
                slots={{
                    name: 'Stroke size (L)',
                    desc: `Large stroke size in pixels. Default: ${defaultStrokeSizes.l}`,
                    control: (
                        <Setting.Text
                            value={`${currentStrokeSizes?.l ?? ''}`}
                            placeholder={`${defaultStrokeSizes.l}`}
                            onChange={(v) => onStrokeSizeChange('l', v)}
                        />
                    )
                }}
            />
            <Setting
                slots={{
                    name: 'Stroke size (XL)',
                    desc: `Extra large stroke size in pixels. Default: ${defaultStrokeSizes.xl}`,
                    control: (
                        <>
                            <Setting.Text
                                value={`${currentStrokeSizes?.xl ?? ''}`}
                                placeholder={`${defaultStrokeSizes.xl}`}
                                onChange={(v) => onStrokeSizeChange('xl', v)}
                            />
                            <Setting.ExtraButton
                                icon={'reset'}
                                tooltip={'reset all stroke sizes'}
                                onClick={resetStrokeSizes}
                            />
                        </>
                    )
                }}
            />
        </>
    )
}

function ClipboardOptionsGroup() {
    const settingsManager = useSettingsManager();
    const settings = useUserPluginSettings(settingsManager);
    const onPasteAtCursor = useCallback(async (value: boolean) => {
        await settingsManager.updatePasteAtCursor(value);
    }, [settingsManager]);

    const resetPasteAtCursor = useCallback(async () => {
        await settingsManager.updatePasteAtCursor(undefined);
    }, [settingsManager]);
    return (
        <>
            <Setting
                slots={{
                    name: 'Paste at cursor',
                    desc: (
                        <>
                            This can be accessed in the editor by navigating the menu:<br />
                            <code>
                                {'Menu > Preferences > Paste at cursor'}
                            </code>
                        </>
                    ),
                    control: (
                        <>
                            <Setting.Toggle
                                value={!!settings.clipboard?.pasteAtCursor}
                                onChange={onPasteAtCursor}
                            />
                            <Setting.ExtraButton
                                icon={'reset'}
                                tooltip={'reset'}
                                onClick={resetPasteAtCursor}
                            />
                        </>
                    )
                }}
            />
        </>
    )
}

function LayerPanelGroup() {
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
                        <Setting.Toggle
                            value={layerPanelEnabled}
                            onChange={onLayerPanelEnabledChanged}
                        />
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
                    info: layerPanelEnabled ? undefined : (
                        <p style={{ color: 'var(--color-yellow)' }}>Enable the layer panel above to change this setting</p>
                    ),
                    control: (
                        <Setting.Toggle
                            value={layerPanelDefaultCollapsed}
                            onChange={onLayerPanelDefaultCollapsedChanged}
                        />
                    )
                }}
                disabled={!layerPanelEnabled}
            />
        </>
    );
}

function UIOptionsGroup() {
    const manager = useSettingsManager();
    const settings = useUserPluginSettings(manager);

    const onCompactModeChanged = useCallback(async (value: boolean) => {
        if (!manager.settings.ui) {
            manager.settings.ui = {};
        }
        manager.settings.ui.forceCompactMode = value;
        await manager.updateSettings(manager.settings);
    }, [manager]);

    const forceCompactMode = settings.ui?.forceCompactMode ?? DEFAULT_SETTINGS.ui.forceCompactMode;

    return (
        <>
            <Setting
                slots={{
                    name: 'Compact mode',
                    desc: (
                        <>
                            Force the compact (mobile) UI mode even on desktop. This provides a more streamlined interface with smaller controls.
                            <code className="ptl-default-code">
                                DEFAULT: {DEFAULT_SETTINGS.ui.forceCompactMode ? 'On' : 'Off'}
                            </code>
                        </>
                    ),
                    control: (
                        <Setting.Toggle
                            value={forceCompactMode}
                            onChange={onCompactModeChanged}
                        />
                    )
                }}
            />
        </>
    );
}

export default function TldrawEditorOptions() {
    return (
        <>
            <h2>User interface</h2>
            <Setting.Container>
                <UIOptionsGroup />
            </Setting.Container>
            <h2>Layer panel</h2>
            <Setting.Container>
                <LayerPanelGroup />
            </Setting.Container>
            <h2>Clipboard options</h2>
            <Setting.Container>
                <ClipboardOptionsGroup />
            </Setting.Container>
            <h2>Shape options</h2>
            <Setting.Container>
                <ShapeOptionsGroup />
            </Setting.Container>
            <h2>Pointer options</h2>
            <Setting.Container>
                <TldrawEditorOptionsGroup />
            </Setting.Container>
            <h2>Camera options</h2>
            <Setting.Container>
                <CameraOptionsSettings />
            </Setting.Container>
        </>
    );
}
