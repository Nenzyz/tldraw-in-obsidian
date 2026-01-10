import { AssetRecordType, createShapeId, DefaultDashStyle, DefaultFillStyle, DefaultSizeStyle, Editor, TldrawFile, TLImageShape } from "tldraw";
import * as React from "react";
import TldrawPlugin from "src/main";
import { TldrawPluginMetaData } from "src/utils/document";
import { isObsidianThemeDark } from "src/utils/utils";
import monkeyPatchEditorInstance from "src/tldraw/monkey-patch/editor";
import useUserPluginSettings from "./useUserPluginSettings";

/**
 * Check if the given text is valid SVG markup.
 */
function isSvgText(text: string): boolean {
    const trimmed = text.trim();
    return /^[\s\S]*<svg[\s\S]*<\/svg>\s*$/i.test(trimmed);
}

/**
 * Parse SVG dimensions from the SVG markup.
 * Tries to get width/height from attributes first, then falls back to viewBox.
 */
function parseSvgDimensions(svgText: string): { width: number; height: number } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');

    if (!svg) {
        return { width: 300, height: 150 }; // Default fallback
    }

    // Try to get dimensions from width/height attributes
    let width = parseFloat(svg.getAttribute('width') ?? '');
    let height = parseFloat(svg.getAttribute('height') ?? '');

    // If width/height are not numbers, try viewBox
    if (isNaN(width) || isNaN(height)) {
        const viewBox = svg.getAttribute('viewBox');
        if (viewBox) {
            const parts = viewBox.split(/[\s,]+/).map(parseFloat);
            if (parts.length === 4 && parts.every(n => !isNaN(n))) {
                width = parts[2];
                height = parts[3];
            }
        }
    }

    // Final fallback
    if (isNaN(width) || width <= 0) width = 300;
    if (isNaN(height) || height <= 0) height = 150;

    return { width, height };
}

/**
 * Create an image asset and shape from SVG text.
 */
async function createSvgImageAsset(
    editor: Editor,
    svgText: string,
    position: { x: number; y: number }
): Promise<void> {
    const { width, height } = parseSvgDimensions(svgText);

    // Create a blob from the SVG text
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });

    // Upload the asset using the editor's asset store
    const assetId = AssetRecordType.createId();
    const file = new File([svgBlob], 'pasted-svg.svg', { type: 'image/svg+xml' });

    // Let tldraw handle the asset upload
    const asset = await editor.getAssetForExternalContent({ type: 'file', file });

    if (!asset) {
        console.warn('Failed to create asset from SVG');
        return;
    }

    // Create the asset in the store
    editor.createAssets([asset]);

    // Create the image shape
    const shapeId = createShapeId();
    editor.createShape<TLImageShape>({
        id: shapeId,
        type: 'image',
        x: position.x,
        y: position.y,
        props: {
            assetId: asset.id,
            w: width,
            h: height,
        },
    });

    // Select the new shape
    editor.select(shapeId);
}

export type SetTldrawFileData = (data: {
    meta: TldrawPluginMetaData
    tldrawFile: TldrawFile
}) => void;

export function useTldrawAppEffects({
    editor, initialTool, isReadonly, settingsManager, selectNone,
    onEditorMount,
    setFocusedEditor,
}: {
    editor?: Editor,
    initialTool?: string,
    isReadonly: boolean,
    settingsManager: TldrawPlugin['settingsManager'],
    selectNone: boolean,
    setFocusedEditor: (editor: Editor) => void,
    onEditorMount?: (editor: Editor) => void,
}) {
    const settings = useUserPluginSettings(settingsManager);

    /**
     * Effect for editor mounting
     */
    React.useEffect(() => {
        if (!editor) return;

        monkeyPatchEditorInstance(editor, settingsManager);

        if (selectNone) {
            editor.selectNone();
        }

        const {
            themeMode,
            gridMode,
            debugMode,
            snapMode,
            focusMode,
            toolSelected,
        } = settingsManager.settings;

        editor.setCurrentTool(initialTool ?? toolSelected)

        let darkMode = true;
        if (themeMode === "dark") darkMode = true;
        else if (themeMode === "light") darkMode = false;
        else darkMode = isObsidianThemeDark();

        editor.user.updateUserPreferences({
            colorScheme: darkMode ? 'dark' : 'light',
            isSnapMode: snapMode,
        });

        editor.updateInstanceState({
            isReadonly: isReadonly,
            isGridMode: gridMode,
            isDebugMode: debugMode,
            isFocusMode: focusMode,
        });

        // Apply default shape styles
        const { defaultFill, defaultDash, defaultSize } = settingsManager.settings.tldrawOptions ?? {};
        if (defaultFill) {
            editor.setStyleForNextShapes(DefaultFillStyle, defaultFill);
        }
        if (defaultDash) {
            editor.setStyleForNextShapes(DefaultDashStyle, defaultDash);
        }
        if (defaultSize) {
            editor.setStyleForNextShapes(DefaultSizeStyle, defaultSize);
        }

        setFocusedEditor(editor);
        onEditorMount?.(editor);
        // NOTE: These could probably be utilized for storing assets as files in the vault instead of tldraw's default indexedDB.
        // editor.registerExternalAssetHandler
        // editor.registerExternalContentHandler
    }, [editor, settingsManager]);

    /**
     * Effect for user settings change
     */
    React.useEffect(() => {
        if (!editor) return;
        const laserDelayMs = settings.tldrawOptions?.laserDelayMs;
        if (laserDelayMs && !Number.isNaN(laserDelayMs)) {
            // @ts-ignore
            // Even this is typed as readonly, we can still modify this property.
            // NOTE: We do not want to re-render the editor, so we do not pass it to the TldrawApp component.
            editor.options.laserDelayMs = laserDelayMs;
        }

        if (settings.cameraOptions) {
            editor.setCameraOptions(settings.cameraOptions);
        }

        editor.user.updateUserPreferences({
            isPasteAtCursorMode: settings.clipboard?.pasteAtCursor
        });
    }, [editor, settings]);

    /**
     * Effect for fixing tooltip positioning in Obsidian.
     *
     * tldraw v4 tooltips use Radix UI and portal to document.body (not the tldraw container).
     * However, Obsidian's workspace containers have CSS properties (transform, filter, contain)
     * that create new containing blocks for position:fixed elements.
     *
     * Since tooltips render to document.body but their trigger elements are inside the
     * containing block, the calculated positions are offset. This effect observes document.body
     * for tooltip additions and corrects their transform by the containing block offset.
     */
    React.useEffect(() => {
        if (!editor) return;

        const container = editor.getContainer();

        // Find the containing block offset by comparing fixed positioning
        const getContainingBlockOffset = (): { x: number; y: number } => {
            // Create a test element to measure the containing block offset
            const testEl = document.createElement('div');
            testEl.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;visibility:hidden;';
            container.appendChild(testEl);
            const rect = testEl.getBoundingClientRect();
            testEl.remove();
            return { x: rect.left, y: rect.top };
        };

        const fixTooltipPosition = (wrapper: HTMLElement) => {
            const offset = getContainingBlockOffset();
            if (offset.x === 0 && offset.y === 0) return; // No offset needed

            // Get current transform
            const currentTransform = wrapper.style.transform;
            const match = currentTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
            if (!match) return;

            const currentX = parseFloat(match[1]);
            const currentY = parseFloat(match[2]);

            // Apply corrected position
            const newX = currentX - offset.x;
            const newY = currentY - offset.y;
            wrapper.style.transform = `translate(${newX}px, ${newY}px)`;
        };

        // Observe for tooltip elements
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        // Check if this is a tooltip wrapper
                        if (node.hasAttribute('data-radix-popper-content-wrapper')) {
                            const tooltip = node.querySelector('.tlui-tooltip');
                            if (tooltip) {
                                // Fix position after a microtask to let Radix set the initial position
                                queueMicrotask(() => fixTooltipPosition(node));
                            }
                        }
                        // Also check children
                        const wrappers = Array.from(node.querySelectorAll('[data-radix-popper-content-wrapper]'));
                        for (const wrapper of wrappers) {
                            if (wrapper.querySelector('.tlui-tooltip')) {
                                queueMicrotask(() => fixTooltipPosition(wrapper as HTMLElement));
                            }
                        }
                    }
                });
            }
        });

        // Watch document.body since tooltips are portaled there (not the tldraw container)
        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [editor]);

    /**
     * Effect for SVG paste handling.
     * Intercepts paste events to detect SVG text and create image assets.
     */
    React.useEffect(() => {
        if (!editor) return;

        const container = editor.getContainer();

        const handlePaste = async (event: ClipboardEvent) => {
            // Only handle if clipboard has text data
            const clipboardData = event.clipboardData;
            if (!clipboardData) return;

            // Check if there's text that looks like SVG
            const text = clipboardData.getData('text/plain');
            if (!text || !isSvgText(text)) return;

            // Don't handle if there are files (let tldraw handle file drops)
            if (clipboardData.files.length > 0) return;

            // Prevent default paste behavior
            event.preventDefault();
            event.stopPropagation();

            // Get paste position (center of viewport or cursor position)
            const viewportPageBounds = editor.getViewportPageBounds();
            const position = {
                x: viewportPageBounds.x + viewportPageBounds.w / 2,
                y: viewportPageBounds.y + viewportPageBounds.h / 2,
            };

            // Create the SVG image asset
            await createSvgImageAsset(editor, text, position);
        };

        // Add listener with capture to intercept before tldraw's handler
        container.addEventListener('paste', handlePaste, { capture: true });

        return () => {
            container.removeEventListener('paste', handlePaste, { capture: true });
        };
    }, [editor]);
}
