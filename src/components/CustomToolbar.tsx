import React from "react";
import { DefaultToolbar, DefaultToolbarContent, ToolbarItem } from "tldraw";
import LassoSelectTool from "src/tldraw/tools/lasso-select-tool";
import { CommentTool } from "src/tldraw/tools/comment-tool";

/**
 * Custom toolbar that includes the lasso select tool and comment tool.
 * Includes all default tools plus the lasso and comment tools.
 */
export function CustomToolbar() {
    return (
        <DefaultToolbar>
            <DefaultToolbarContent />
            <ToolbarItem tool={LassoSelectTool.id} />
            <ToolbarItem tool={CommentTool.id} />
        </DefaultToolbar>
    );
}
