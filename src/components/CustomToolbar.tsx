import React from "react";
import { DefaultToolbar, DefaultToolbarContent, ToolbarItem } from "tldraw";
import LassoSelectTool from "src/tldraw/tools/lasso-select-tool";

/**
 * Custom toolbar that includes the lasso select tool.
 * Includes all default tools plus the lasso tool.
 */
export function CustomToolbar() {
    return (
        <DefaultToolbar>
            <DefaultToolbarContent />
            <ToolbarItem tool={LassoSelectTool.id} />
        </DefaultToolbar>
    );
}
