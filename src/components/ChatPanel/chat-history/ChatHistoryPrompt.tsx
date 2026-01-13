import React from 'react';

export interface ChatHistoryPromptItem {
    type: 'prompt';
    message: string;
    contextItems: unknown[];
    selectedShapes: unknown[];
}

export function ChatHistoryPrompt({ item }: { item: ChatHistoryPromptItem }) {
    const { message, contextItems, selectedShapes } = item;
    const showTags = (selectedShapes?.length ?? 0) > 0 || (contextItems?.length ?? 0) > 0;

    return (
        <div className="ptl-chat-history-prompt-container">
            <div className="ptl-chat-history-prompt">
                {showTags && (
                    <div className="ptl-prompt-tags">
                        {(selectedShapes?.length ?? 0) > 0 && (
                            <span className="ptl-prompt-tag">
                                {selectedShapes.length} selected
                            </span>
                        )}
                        {contextItems?.map((_, i) => (
                            <span key={i} className="ptl-prompt-tag">
                                Context
                            </span>
                        ))}
                    </div>
                )}
                {message}
            </div>
        </div>
    );
}
