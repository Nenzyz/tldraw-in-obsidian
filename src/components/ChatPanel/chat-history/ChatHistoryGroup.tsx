import React, { useCallback, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import { isRecordsDiffEmpty, RecordsDiff, reverseRecordsDiff, squashRecordDiffs, TLRecord } from 'tldraw';
import { TldrawAgent } from 'src/ai/agent/TldrawAgent';
import { ChatHistoryItem as AgentChatHistoryItem, ChatHistoryActionItem as AgentChatHistoryActionItem } from 'src/ai/shared/types/ChatHistoryItem';
import { AgentIcon } from '../icons/AgentIcon';
import { ChevronDownIcon, ChevronRightIcon } from '../icons/AgentIcon';
import { TldrawDiffViewer } from './TldrawDiffViewer';
import { getActionInfo } from './getActionInfo';

// Action type that can be from Streaming<AgentAction>
export type StreamingActionLike = {
    _type?: string;
    complete: boolean;
    time: number;
} & Record<string, unknown>;

export interface ChatHistoryActionItem {
    type: 'action';
    action: StreamingActionLike;
    diff: RecordsDiff<TLRecord>;
    acceptance: 'pending' | 'accepted' | 'rejected';
}

export interface ChatHistoryGroup {
    items: ChatHistoryActionItem[];
    withDiff: boolean;
}

/**
 * Group adjacent actions that can be merged together.
 */
export function getActionHistoryGroups(items: ChatHistoryActionItem[]): ChatHistoryGroup[] {
    const groups: ChatHistoryGroup[] = [];

    for (const item of items) {
        const info = getActionInfo(item.action);
        if (info.description === null) {
            continue;
        }

        const lastGroup = groups[groups.length - 1];
        if (lastGroup && canActionBeGrouped(item, lastGroup)) {
            lastGroup.items.push(item);
        } else {
            const diffEmpty = isRecordsDiffEmpty(item.diff);
            const withDiff = !diffEmpty && item.action.complete;

            groups.push({
                items: [item],
                withDiff,
            });
        }
    }

    return groups;
}

function canActionBeGrouped(item: ChatHistoryActionItem, group: ChatHistoryGroup): boolean {
    if (!item.action.complete) return false;
    if (!group || group.items.length === 0) return false;

    // Check if diff status matches the group
    const showDiff = !isRecordsDiffEmpty(item.diff);
    if (showDiff !== group.withDiff) return false;

    // Check if acceptance status matches
    const groupAcceptance = group.items[0]?.acceptance;
    if (groupAcceptance !== item.acceptance) return false;

    const prevAction = group.items[group.items.length - 1]?.action;
    if (!prevAction) return false;

    const actionInfo = getActionInfo(item.action);
    const prevActionInfo = getActionInfo(prevAction);

    return actionInfo.canGroup(prevAction) && prevActionInfo.canGroup(item.action);
}

export function ChatHistoryGroupComponent({
    group,
    agent,
}: {
    group: ChatHistoryGroup;
    agent: TldrawAgent;
}) {
    if (group.withDiff) {
        return <ChatHistoryGroupWithDiff group={group} agent={agent} />;
    }
    return <ChatHistoryGroupWithoutDiff group={group} />;
}

/**
 * Group component for actions that modify shapes (with Accept/Reject buttons).
 */
function ChatHistoryGroupWithDiff({
    group,
    agent,
}: {
    group: ChatHistoryGroup;
    agent: TldrawAgent;
}) {
    const { items } = group;
    const { editor } = agent;

    const diff = useMemo(() => {
        return squashRecordDiffs(items.map((item) => item.diff));
    }, [items]);

    // Accept all changes from this group
    const handleAccept = useCallback(() => {
        agent.$chatHistory.update((currentChatHistoryItems) => {
            const newItems = [...currentChatHistoryItems];
            for (const item of items) {
                // Find matching item in agent's chat history by comparing action references
                const index = newItems.findIndex((v) =>
                    v.type === 'action' && v.action === item.action
                );

                // Mark the item as accepted
                if (index !== -1) {
                    const existingItem = newItems[index] as AgentChatHistoryActionItem;
                    newItems[index] = { ...existingItem, acceptance: 'accepted' };

                    // Apply the diff if it was previously rejected
                    if (existingItem.acceptance === 'rejected') {
                        editor.store.applyDiff(existingItem.diff);
                    }
                }
            }
            return newItems;
        });
    }, [items, editor, agent.$chatHistory]);

    // Reject all changes from this group
    const handleReject = useCallback(() => {
        agent.$chatHistory.update((currentChatHistoryItems) => {
            const newItems = [...currentChatHistoryItems];
            for (const item of items) {
                // Find matching item in agent's chat history by comparing action references
                const index = newItems.findIndex((v) =>
                    v.type === 'action' && v.action === item.action
                );

                // Mark the item as rejected
                if (index !== -1) {
                    const existingItem = newItems[index] as AgentChatHistoryActionItem;
                    newItems[index] = { ...existingItem, acceptance: 'rejected' };

                    // Reverse the diff if not already rejected
                    if (existingItem.acceptance !== 'rejected') {
                        const reverseDiff = reverseRecordsDiff(existingItem.diff);
                        editor.store.applyDiff(reverseDiff);
                    }
                }
            }
            return newItems;
        });
    }, [items, editor, agent.$chatHistory]);

    // Get the acceptance status of the group
    const acceptance = useMemo<ChatHistoryActionItem['acceptance']>(() => {
        if (items.length === 0) return 'pending';
        const acceptance = items[0].acceptance;
        for (let i = 1; i < items.length; i++) {
            if (items[i].acceptance !== acceptance) {
                return 'pending';
            }
        }
        return acceptance;
    }, [items]);

    const nonEmptyItems = useMemo(() => {
        return items.filter((item) => {
            const info = getActionInfo(item.action);
            return info.description !== null;
        });
    }, [items]);

    if (nonEmptyItems.length === 0) {
        return null;
    }

    return (
        <div className="ptl-chat-history-group ptl-chat-history-change">
            <div className="ptl-chat-history-change-acceptance">
                <button
                    onClick={handleReject}
                    disabled={acceptance === 'rejected'}
                >
                    {acceptance === 'rejected' ? 'Rejected' : 'Reject'}
                </button>
                <button
                    onClick={handleAccept}
                    disabled={acceptance === 'accepted'}
                >
                    {acceptance === 'accepted' ? 'Accepted' : 'Accept'}
                </button>
            </div>
            <DiffSteps items={nonEmptyItems} />
            <TldrawDiffViewer diff={diff} />
        </div>
    );
}

function DiffSteps({ items }: { items: ChatHistoryActionItem[] }) {
    let previousDescription = '';
    return (
        <div className="ptl-agent-changes">
            {items.map((item, i) => {
                const { icon, description } = getActionInfo(item.action);
                if (!description) return null;
                if (description === previousDescription) return null;
                previousDescription = description;
                return (
                    <div className="ptl-agent-change" key={'intent-' + i}>
                        {icon && (
                            <span className="ptl-agent-change-icon">
                                <AgentIcon type={icon} />
                            </span>
                        )}
                        {description}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Group component for actions without shape changes (think, message, etc).
 * Collapsible by default when complete, with "Thought for X seconds" summary.
 */
function ChatHistoryGroupWithoutDiff({ group }: { group: ChatHistoryGroup }) {
    const { items } = group;

    const nonEmptyItems = useMemo(() => {
        return items.filter((item) => {
            const info = getActionInfo(item.action);
            return info.description !== null;
        });
    }, [items]);

    const complete = useMemo(() => {
        return items.every((item) => item.action.complete);
    }, [items]);

    // Check if this group is all think actions (collapsible)
    const isThinkGroup = useMemo(() => {
        return items.every((item) => item.action._type === 'think');
    }, [items]);

    // Collapsed by default when complete (matching template behavior)
    const [collapsed, setCollapsed] = useState(true);

    const summary = useMemo(() => {
        const time = Math.floor(items.reduce((acc, item) => acc + item.action.time, 0) / 1000);
        if (time === 0) return 'Thought for less than a second';
        if (time === 1) return 'Thought for 1 second';
        return `Thought for ${time} seconds`;
    }, [items]);

    if (nonEmptyItems.length === 0) {
        return null;
    }

    // Single item - just render it directly
    if (nonEmptyItems.length === 1) {
        return (
            <div className="ptl-chat-history-group">
                <ChatHistoryItem item={nonEmptyItems[0]} />
            </div>
        );
    }

    // Multiple think actions - collapsible group
    if (isThinkGroup) {
        const showContent = !collapsed || !complete;

        return (
            <div className="ptl-chat-history-group">
                {complete && (
                    <button
                        className="ptl-chat-history-collapse-btn"
                        onClick={() => setCollapsed((v) => !v)}
                    >
                        <span className="ptl-chat-history-collapse-icon">
                            {showContent ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        </span>
                        {summary}
                    </button>
                )}
                {showContent && (
                    <div className="ptl-agent-actions-container">
                        {nonEmptyItems.map((item, i) => (
                            <ChatHistoryItemExpanded
                                key={`action-${i}`}
                                action={item.action}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Multiple non-think actions - render all
    return (
        <div className="ptl-chat-history-group">
            <div className="ptl-agent-actions-container">
                {nonEmptyItems.map((item, i) => (
                    <ChatHistoryItemExpanded key={`action-${i}`} action={item.action} />
                ))}
            </div>
        </div>
    );
}

function ChatHistoryItem({ item }: { item: ChatHistoryActionItem }) {
    const { action } = item;
    const { description, summary, icon } = getActionInfo(action);
    const collapsible = summary !== null && action._type === 'think';
    const isMessage = action._type === 'message';
    // Collapsed by default when complete (matching template behavior)
    const [collapsed, setCollapsed] = useState(collapsible);

    if (!description) return null;

    return (
        <div className="ptl-agent-actions-container">
            {action.complete && collapsible && (
                <button
                    className="ptl-chat-history-collapse-btn"
                    onClick={() => setCollapsed((v) => !v)}
                >
                    <span className="ptl-chat-history-collapse-icon">
                        {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                    </span>
                    {summary}
                </button>
            )}

            {(!collapsed || !action.complete) && (
                <div className={`ptl-agent-action ptl-agent-action-type-${action._type ?? 'unknown'}`}>
                    {icon && (
                        <span className="ptl-agent-action-icon">
                            <AgentIcon type={icon} />
                        </span>
                    )}
                    <span className="ptl-agent-action-description">
                        {isMessage ? <Markdown>{description}</Markdown> : description}
                    </span>
                </div>
            )}
        </div>
    );
}

function ChatHistoryItemExpanded({
    action,
}: {
    action: StreamingActionLike;
}) {
    const { icon, description } = getActionInfo(action);
    const isMessage = action._type === 'message';

    if (!description) return null;

    return (
        <div className={`ptl-agent-action ptl-agent-action-type-${action._type ?? 'unknown'}`}>
            {icon && (
                <span className="ptl-agent-action-icon">
                    <AgentIcon type={icon} />
                </span>
            )}
            <span className="ptl-agent-action-description">
                {isMessage ? <Markdown>{description}</Markdown> : description}
            </span>
        </div>
    );
}
