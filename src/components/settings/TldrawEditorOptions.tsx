import React, { useCallback } from "react";
import Setting from "./Setting";
import CameraOptionsSettings from "./CameraOptionsSettings";
import useSettingsManager from "src/hooks/useSettingsManager";
import useUserPluginSettings from "src/hooks/useUserPluginSettings";
import { defaultTldrawOptions } from "tldraw";

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

export default function TldrawEditorOptions() {
    return (
        <>
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
