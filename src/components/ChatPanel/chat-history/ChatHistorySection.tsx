import React from 'react';
import { TldrawAgent } from 'src/ai/agent/TldrawAgent';
import { SmallSpinner } from '../icons/SmallSpinner';
import { ChatHistoryPrompt, ChatHistoryPromptItem } from './ChatHistoryPrompt';
import {
    ChatHistoryActionItem,
    ChatHistoryGroupComponent,
    getActionHistoryGroups,
} from './ChatHistoryGroup';

export interface ChatHistorySection {
    prompt: ChatHistoryPromptItem;
    items: ChatHistoryActionItem[];
}

export function ChatHistorySectionComponent({
    section,
    loading,
    agent,
}: {
    section: ChatHistorySection;
    loading: boolean;
    agent: TldrawAgent;
}) {
    const actions = section.items.filter((item) => item.type === 'action');
    const groups = getActionHistoryGroups(actions);

    return (
        <div className="ptl-chat-history-section">
            <ChatHistoryPrompt item={section.prompt} />
            {groups.map((group, i) => (
                <ChatHistoryGroupComponent key={`group-${i}`} group={group} agent={agent} />
            ))}
            {loading && <SmallSpinner />}
        </div>
    );
}

/**
 * Convert flat chat history items into sections.
 * Each section starts with a prompt and contains all subsequent actions
 * until the next prompt.
 */
export function getAgentHistorySections(
    items: Array<ChatHistoryPromptItem | ChatHistoryActionItem>
): ChatHistorySection[] {
    const sections: ChatHistorySection[] = [];

    for (const item of items) {
        if (item.type === 'prompt') {
            sections.push({
                prompt: item,
                items: [],
            });
            continue;
        }

        // Add action to current section
        if (sections.length > 0) {
            sections[sections.length - 1].items.push(item);
        }
    }

    return sections;
}
