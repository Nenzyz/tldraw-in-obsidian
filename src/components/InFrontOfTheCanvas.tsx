import React, { ReactNode, useState, useCallback } from "react"
import TextSuggestions from "./TextSuggestions";
import LayerPanel from "./LayerPanel";
import ChatPanel from "./ChatPanel";
import { useSettings } from "src/contexts/tldraw-settings-context";

export default function InFrontOfTheCanvas({ children }: {
    children?: ReactNode
}) {
    const settings = useSettings();

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
    const isChatPanelEnabled = settings.ai?.enabled ?? false;

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
                <ChatPanel
                    defaultCollapsed={!settings.ai?.showChatPanel}
                    isOpen={activePanel === 'chat'}
                    onOpenChange={handleChatPanelOpenChange}
                />
            )}
        </>
    );
}
