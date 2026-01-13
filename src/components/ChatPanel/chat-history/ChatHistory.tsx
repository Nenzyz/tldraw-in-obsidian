import React, { useMemo, useRef, useEffect } from 'react';
import { TldrawAgent } from 'src/ai/agent/TldrawAgent';
import {
    ChatHistorySectionComponent,
    getAgentHistorySections,
} from './ChatHistorySection';
import { ChatHistoryPromptItem } from './ChatHistoryPrompt';
import { ChatHistoryActionItem } from './ChatHistoryGroup';

export type ChatHistoryItem = ChatHistoryPromptItem | ChatHistoryActionItem;

interface ChatHistoryProps {
    items: ChatHistoryItem[];
    loading: boolean;
    agent: TldrawAgent;
}

export function ChatHistory({ items, loading, agent }: ChatHistoryProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const sections = useMemo(() => {
        return getAgentHistorySections(items);
    }, [items]);

    // Auto-scroll to bottom when new items added
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [items]);

    if (sections.length === 0) {
        return (
            <div className="ptl-chat-fallback">
                <p>Ask me anything about your drawing or get help with ideas.</p>
            </div>
        );
    }

    return (
        <div className="ptl-chat-history" ref={scrollRef}>
            {sections.map((section, i) => {
                const isLast = i === sections.length - 1;
                return (
                    <ChatHistorySectionComponent
                        key={`section-${i}`}
                        section={section}
                        loading={isLast && loading}
                        agent={agent}
                    />
                );
            })}
        </div>
    );
}
