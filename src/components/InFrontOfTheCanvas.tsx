import React, { ReactNode, useState, useCallback, useMemo } from "react"
import { useEditor, useValue, TLShapeId } from "tldraw";
import TextSuggestions from "./TextSuggestions";
import LayerPanel from "./LayerPanel";
import ChatPanel from "./ChatPanel";
import { CommentNavigatorPanel } from "./CommentNavigatorPanel";
import { CommentThreadPanel } from "./CommentThreadPanel";
import { ContextHighlights } from "./ChatPanel/highlights";
import { useSettings } from "src/contexts/tldraw-settings-context";
import { useTldrawAgent } from "src/ai/agent/useTldrawAgent";
import { AISettings } from "src/ai/agent/streamAgent";
import type { TLCommentShape } from "src/tldraw/shapes/comment/CommentShape";

export default function InFrontOfTheCanvas({ children }: {
    children?: ReactNode
}) {
    const settings = useSettings();
    const editor = useEditor();

    // Provide API keys for all providers to the agent
    // The model is selected in the agent window, not here
    const getSettings = useCallback((): AISettings => {
        return {
            providers: settings.ai?.providers as AISettings['providers'],
            maxTokens: settings.ai?.maxTokens,
            apiKey: settings.ai?.apiKey, // Legacy fallback for anthropic
            customSystemPrompt: settings.ai?.customSystemPrompt,
            customJsonSchema: settings.ai?.customJsonSchema,
        };
    }, [settings]);

    // Create the TldrawAgent for AI chat integration
    const isChatPanelEnabled = settings.ai?.enabled ?? false;
    const agent = useTldrawAgent({
        editor,
        id: 'tldraw-in-obsidian-agent',
        getSettings,
    });

    // Track which panel is currently open (for mutual exclusivity)
    const [activePanel, setActivePanel] = useState<'layer' | 'chat' | 'comment' | null>(() => {
        // Initialize based on default collapsed settings
        if (settings.layerPanel?.enabled && !settings.layerPanel?.defaultCollapsed) {
            return 'layer';
        }
        if (settings.ai?.enabled && settings.ai?.showChatPanel) {
            return 'chat';
        }
        // Comment navigator defaults to collapsed
        return null;
    });

    // Get current username from settings (default to 'User')
    const currentUser = settings.username || 'User';

    // Track selected comment for thread panel
    const selectedCommentId = useValue(
        'selectedComment',
        () => {
            const selectedShapes = editor.getSelectedShapes();
            if (selectedShapes.length === 1) {
                const shape = selectedShapes[0];
                if (shape.type === 'comment') {
                    return shape.id as TLShapeId;
                }
            }
            return null;
        },
        [editor]
    );

    // Handle LayerPanel open/close with mutual exclusivity
    const handleLayerPanelOpenChange = useCallback((isOpen: boolean) => {
        if (isOpen) {
            setActivePanel('layer');
        } else if (activePanel === 'layer') {
            setActivePanel(null);
        }
    }, [activePanel]);

    // Handle ChatPanel open/close with mutual exclusivity
    const handleChatPanelOpenChange = useCallback((isOpen: boolean) => {
        if (isOpen) {
            setActivePanel('chat');
        } else if (activePanel === 'chat') {
            setActivePanel(null);
        }
    }, [activePanel]);

    // Handle CommentNavigatorPanel open/close with mutual exclusivity
    const handleCommentNavigatorOpenChange = useCallback((isOpen: boolean) => {
        if (isOpen) {
            setActivePanel('comment');
        } else if (activePanel === 'comment') {
            setActivePanel(null);
        }
    }, [activePanel]);

    const isLayerPanelEnabled = settings.layerPanel?.enabled ?? false;
    // Comment navigator is always enabled (no settings toggle yet)
    const isCommentNavigatorEnabled = true;

    return (
        <>
            {children}
            <TextSuggestions />
            {isLayerPanelEnabled && (
                <LayerPanel
                    defaultCollapsed={settings.layerPanel?.defaultCollapsed}
                    isOpen={activePanel === 'layer'}
                    onOpenChange={handleLayerPanelOpenChange}
                />
            )}
            {isChatPanelEnabled && (
                <>
                    <ChatPanel
                        agent={agent}
                        defaultCollapsed={!settings.ai?.showChatPanel}
                        isOpen={activePanel === 'chat'}
                        onOpenChange={handleChatPanelOpenChange}
                    />
                    <ContextHighlights agent={agent} />
                </>
            )}
            {isCommentNavigatorEnabled && (
                <CommentNavigatorPanel
                    defaultCollapsed={true}
                    isOpen={activePanel === 'comment'}
                    onOpenChange={handleCommentNavigatorOpenChange}
                />
            )}
            {/* Comment Thread Panel - displays when a comment is selected */}
            {selectedCommentId && (
                <CommentThreadPanel
                    commentId={selectedCommentId}
                    currentUser={currentUser}
                    onClose={() => editor.selectNone()}
                />
            )}
        </>
    );
}
