import React, { useEffect, useRef } from 'react';
import {
    defaultAddFontsFromNode,
    defaultBindingUtils,
    defaultEditorAssetUrls,
    defaultShapeUtils,
    Editor,
    StateNode,
    tipTapDefaultExtensions,
    TLComponents,
    TldrawEditor,
    TldrawUiContextProvider,
    TLShape,
} from 'tldraw';

/**
 * A simple tool that does nothing - used for read-only viewing.
 * Defined outside component for stable reference.
 */
class InspectTool extends StateNode {
    static override id = 'inspect';
}

// All static props defined outside component to prevent remount loops in Obsidian
const VIEWER_TOOLS = [InspectTool];
const VIEWER_TEXT_OPTIONS = {
    tipTapConfig: {
        extensions: tipTapDefaultExtensions,
    },
    addFontsFromNode: defaultAddFontsFromNode,
} as any;
const EMPTY_COMPONENTS: TLComponents = {};

/**
 * A lightweight read-only tldraw viewer for previewing shapes.
 * Used by TldrawDiffViewer to show shape changes.
 *
 * IMPORTANT: This component is designed to work in Obsidian's Electron environment
 * which can trigger more re-renders than a standard browser. All props are stabilized
 * and initialization uses refs to prevent infinite loops.
 */
export function TldrawViewer({
    shapes,
    components,
}: {
    shapes: TLShape[];
    components?: TLComponents;
}) {
    const editorRef = useRef<Editor | null>(null);
    const initializedRef = useRef(false);
    const shapesRef = useRef(shapes);

    // Use provided components or empty object (both stable references)
    const componentsToUse = components ?? EMPTY_COMPONENTS;

    // Cleanup editor on unmount only
    useEffect(() => {
        return () => {
            if (editorRef.current) {
                try {
                    editorRef.current.dispose();
                } catch (err) {
                    // Ignore disposal errors
                }
            }
        };
    }, []);

    // Handle editor mount - uses refs to avoid triggering re-renders
    const handleEditorMount = (newEditor: Editor) => {
        // Guard against double initialization (critical for Obsidian's Electron environment)
        if (initializedRef.current) return;
        initializedRef.current = true;
        editorRef.current = newEditor;

        const currentShapes = shapesRef.current;
        if (currentShapes.length === 0) return;

        try {
            newEditor.updateInstanceState({ isReadonly: false });
            newEditor.setCameraOptions({ isLocked: false });

            newEditor.createShapes(currentShapes);

            // Zoom to fit all shapes
            newEditor.selectAll();
            const bounds = newEditor.getSelectionPageBounds();
            if (bounds) {
                newEditor.zoomToBounds(bounds, { inset: 20 });
            }

            newEditor.selectNone();
            newEditor.updateInstanceState({ isReadonly: true });
            newEditor.setCameraOptions({ isLocked: true });
        } catch (err) {
            // Silently handle errors - preview is non-critical
        }
    };

    return (
        <div className="ptl-tldraw-viewer">
            <TldrawUiContextProvider>
                <TldrawEditor
                    autoFocus={false}
                    components={componentsToUse}
                    inferDarkMode={false}
                    onMount={handleEditorMount}
                    shapeUtils={defaultShapeUtils}
                    bindingUtils={defaultBindingUtils}
                    tools={VIEWER_TOOLS}
                    textOptions={VIEWER_TEXT_OPTIONS}
                    assetUrls={defaultEditorAssetUrls}
                    initialState="inspect"
                />
            </TldrawUiContextProvider>
        </div>
    );
}
