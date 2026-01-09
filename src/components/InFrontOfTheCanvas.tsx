import React, { ReactNode } from "react"
import TextSuggestions from "./TextSuggestions";
import LayerPanel from "./LayerPanel";
import { useSettings } from "src/contexts/tldraw-settings-context";

export default function InFrontOfTheCanvas({ children }: {
    children?: ReactNode
}) {
    const settings = useSettings();

    return (
        <>
            {children}
            <TextSuggestions />
            {settings.layerPanel?.enabled && (
                <LayerPanel defaultCollapsed={settings.layerPanel?.defaultCollapsed} />
            )}
        </>
    );
}