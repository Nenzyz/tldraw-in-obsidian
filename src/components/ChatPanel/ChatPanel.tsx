import React, { useState, useCallback, useMemo } from 'react';
import { RecordsDiff, TLRecord, useValue } from 'tldraw';
import { ChatInput } from './ChatInput';
import { ChatHistory, ChatHistoryItem } from './chat-history/ChatHistory';
import { StreamingActionLike } from './chat-history/ChatHistoryGroup';
import { TodoList } from './TodoList';
import { useTldrawSettings } from 'src/contexts/tldraw-settings-context';
import { TldrawAgent } from 'src/ai/agent/TldrawAgent';
import { getAgentModelDefinition, AgentModelName } from 'src/ai/models';

export interface ChatPanelProps {
    /** The TldrawAgent instance for canvas interaction */
    agent: TldrawAgent;
    /** Whether the panel starts in a collapsed state */
    defaultCollapsed?: boolean;
    /** Callback when panel open state changes */
    onOpenChange?: (isOpen: boolean) => void;
    /** Whether to force the panel open (controlled mode) */
    isOpen?: boolean;
}

// AI chat icon SVG
const AIChatIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.5V22l3-3 3 3v-4.5c2.9-1.2 5-4.1 5-7.5a8 8 0 0 0-8-8z"></path>
        <circle cx="9" cy="10" r="1"></circle>
        <circle cx="15" cy="10" r="1"></circle>
    </svg>
);

// Close icon SVG
const CloseIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

// New chat icon (plus sign)
const NewChatIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

export function ChatPanel({
    agent,
    defaultCollapsed = true,
    onOpenChange,
    isOpen: controlledIsOpen,
}: ChatPanelProps) {
    const { settings } = useTldrawSettings();
    const [internalIsOpen, setInternalIsOpen] = useState(!defaultCollapsed);

    // Use agent's reactive state
    const isGenerating = useValue('isGenerating', () => agent.isGenerating(), [agent]);
    const chatHistory = useValue('chatHistory', () => agent.$chatHistory.get(), [agent]);

    // Use controlled or uncontrolled mode
    const isPanelOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

    // Create an empty diff for use when diff is missing
    const emptyDiff: RecordsDiff<TLRecord> = { added: {}, updated: {}, removed: {} };

    // Convert agent's chat history format to our ChatHistoryItem format
    const historyItems: ChatHistoryItem[] = useMemo(() => {
        const items: ChatHistoryItem[] = [];
        for (const item of chatHistory) {
            if (item.type === 'prompt') {
                items.push({
                    type: 'prompt' as const,
                    message: item.message,
                    contextItems: item.contextItems ?? [],
                    selectedShapes: item.selectedShapes ?? [],
                });
            } else if (item.type === 'action') {
                items.push({
                    type: 'action' as const,
                    action: item.action as StreamingActionLike,
                    diff: item.diff ?? emptyDiff,
                    acceptance: item.acceptance ?? 'pending',
                });
            }
            // Skip 'continuation' items for now - they're internal agent state
        }
        return items;
    }, [chatHistory]);

    const handleTogglePanel = useCallback(() => {
        const newState = !isPanelOpen;
        if (controlledIsOpen === undefined) {
            setInternalIsOpen(newState);
        }
        onOpenChange?.(newState);
    }, [isPanelOpen, controlledIsOpen, onOpenChange]);

    const handleClosePanel = useCallback(() => {
        if (controlledIsOpen === undefined) {
            setInternalIsOpen(false);
        }
        onOpenChange?.(false);
    }, [controlledIsOpen, onOpenChange]);

    const handleSubmit = useCallback(async (content: string) => {
        try {
            // Use agent.prompt() to send message - it handles everything
            // The agent will get settings (provider, model, API key) via getSettings callback
            await agent.prompt({
                message: content,
                contextItems: agent.$contextItems.get(),
            });
        } catch (error) {
            console.error('Error submitting message:', error);
        }
    }, [agent]);

    const handleCancel = useCallback(() => {
        agent.cancel();
    }, [agent]);

    const handleReset = useCallback(() => {
        agent.reset();
    }, [agent]);

    // Get the current model from the agent's model selector
    const currentModelName = useValue('modelName', () => agent.$modelName.get(), [agent]);

    // Check if API key is configured for the current model's provider
    const hasApiKey = useMemo(() => {
        try {
            // Get the provider for the currently selected model
            const modelDefinition = getAgentModelDefinition(currentModelName as AgentModelName);
            const provider = modelDefinition.provider;
            const providers = settings.ai?.providers;

            // Check if that provider has an API key
            const apiKey = providers?.[provider]?.apiKey;
            if (apiKey) {
                return true;
            }

            // Legacy fallback for anthropic
            if (provider === 'anthropic' && settings.ai?.apiKey) {
                return true;
            }

            return false;
        } catch {
            // If model lookup fails, check if any provider has a key
            const providers = settings.ai?.providers;
            return !!(
                providers?.anthropic?.apiKey ||
                providers?.google?.apiKey ||
                providers?.openai?.apiKey ||
                settings.ai?.apiKey
            );
        }
    }, [settings, currentModelName]);

    return (
        <div className="ptl-chat-panel-wrapper">
            <button
                className="ptl-chat-panel-toggle-btn"
                onClick={handleTogglePanel}
                aria-label={isPanelOpen ? 'Hide AI chat panel' : 'Show AI chat panel'}
                title={isPanelOpen ? 'Hide AI chat' : 'Show AI chat'}
            >
                <AIChatIcon />
            </button>
            {isPanelOpen && (
                <div className="ptl-chat-panel">
                    <div className="ptl-chat-panel-header">
                        <span className="ptl-chat-panel-title">AI Assistant</span>
                        <div className="ptl-chat-panel-header-actions">
                            <button
                                className="ptl-chat-panel-header-btn"
                                onClick={handleReset}
                                aria-label="New chat"
                                title="New chat"
                            >
                                <NewChatIcon />
                            </button>
                            <button
                                className="ptl-chat-panel-header-btn"
                                onClick={handleClosePanel}
                                aria-label="Close chat panel"
                                title="Close"
                            >
                                <CloseIcon />
                            </button>
                        </div>
                    </div>
                    <ChatHistory items={historyItems} loading={isGenerating} agent={agent} />
                    <div className="ptl-chat-panel-input-area">
                        <TodoList agent={agent} />
                        <ChatInput
                            agent={agent}
                            onSubmit={handleSubmit}
                            onCancel={handleCancel}
                            isLoading={isGenerating}
                            disabled={!settings.ai?.enabled || !hasApiKey}
                            placeholder={
                                !settings.ai?.enabled
                                    ? 'Enable AI in settings to use chat'
                                    : !hasApiKey
                                    ? 'Configure API key in settings'
                                    : 'Ask the AI assistant...'
                            }
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default ChatPanel;
