import React, { ReactNode, useState, useCallback, useMemo } from "react"
import { useEditor } from "tldraw";
import TextSuggestions from "./TextSuggestions";
import LayerPanel from "./LayerPanel";
import ChatPanel from "./ChatPanel";
import { ContextHighlights } from "./ChatPanel/highlights";
import { useSettings } from "src/contexts/tldraw-settings-context";
import { useTldrawAgent } from "src/ai/agent/useTldrawAgent";
import { AISettings } from "src/ai/agent/streamAgent";

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
    const [activePanel, setActivePanel] = useState<'layer' | 'chat' | null>(() => {
        // Initialize based on default collapsed settings
        if (settings.layerPanel?.enabled && !settings.layerPanel?.defaultCollapsed) {
            return 'layer';
        }
        if (settings.ai?.enabled && settings.ai?.showChatPanel) {
            return 'chat';
        }
        return null;
    });

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

    const isLayerPanelEnabled = settings.layerPanel?.enabled ?? false;

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
        </>
    );
}
