import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { RecordsDiff, TLRecord, useValue } from 'tldraw';
import { Notice, normalizePath } from 'obsidian';
import { ChatInput } from './ChatInput';
import { ChatHistory, ChatHistoryItem } from './chat-history/ChatHistory';
import { StreamingActionLike } from './chat-history/ChatHistoryGroup';
import { TodoList } from './TodoList';
import { useTldrawSettings } from 'src/contexts/tldraw-settings-context';
import { useObsidian } from 'src/contexts/plugin';
import { TldrawAgent } from 'src/ai/agent/TldrawAgent';
import { getAgentModelDefinition, AgentModelName } from 'src/ai/models';
import { getColocationFolder } from 'src/obsidian/helpers/app';
import { checkAndCreateFolder, getNewUniqueFilepath } from 'src/utils/utils';
import { formatConversationToMarkdown } from './utils/formatConversationToMarkdown';
import { useMentionMonitor } from 'src/hooks/useMentionMonitor';

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

// Download/save icon (arrow down)
const DownloadIcon = () => (
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
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
);

export function ChatPanel({
    agent,
    defaultCollapsed = true,
    onOpenChange,
    isOpen: controlledIsOpen,
}: ChatPanelProps) {
    const { settings } = useTldrawSettings();
    const app = useObsidian();
    const [internalIsOpen, setInternalIsOpen] = useState(!defaultCollapsed);

    // Use agent's reactive state
    const isGenerating = useValue('isGenerating', () => agent.isGenerating(), [agent]);
    const chatHistory = useValue('chatHistory', () => agent.$chatHistory.get(), [agent]);

    // Use controlled or uncontrolled mode
    const isPanelOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

    // Monitor for @AI mentions in comments
    const { newMentions, markAllRead } = useMentionMonitor(agent.editor, {
        pollInterval: 2000, // Check every 2 seconds
        mentionId: 'AI',
        enabled: settings.ai?.enabled ?? false,
    });

    // Track which mentions we've already processed to avoid duplicate triggers
    const processedMentionIds = useRef<Set<string>>(new Set());

    // Auto-trigger AI when new @AI mentions are detected
    useEffect(() => {
        if (!settings.ai?.enabled) return;
        if (isGenerating) return; // Don't trigger while already generating
        if (newMentions.length === 0) return;

        // Find unprocessed mentions
        const unprocessedMentions = newMentions.filter(mentionResult => {
            // Create a unique key for each mention (comment + reply ids)
            for (const reply of mentionResult.replies) {
                const key = `${mentionResult.comment.id}:${reply.id}`;
                if (!processedMentionIds.current.has(key)) {
                    return true;
                }
            }
            return false;
        });

        if (unprocessedMentions.length === 0) return;

        // Mark all current mentions as processed
        for (const mentionResult of unprocessedMentions) {
            for (const reply of mentionResult.replies) {
                const key = `${mentionResult.comment.id}:${reply.id}`;
                processedMentionIds.current.add(key);
            }
        }

        // Build context message for the AI
        const mentionContext = unprocessedMentions.map(m => {
            const replyMessages = m.replies.map(r => `- ${r.author}: "${r.message}"`).join('\n');
            return `Comment thread (ID: ${m.comment.id}):\n${replyMessages}`;
        }).join('\n\n');

        const prompt = `You were mentioned in a comment thread. Please read and respond appropriately.\n\n${mentionContext}`;

        // Trigger the AI with the mention context
        agent.prompt({
            message: prompt,
            contextItems: [],
        }).then(() => {
            // Mark mentions as read after processing
            markAllRead();
        }).catch(error => {
            console.error('Error responding to @AI mention:', error);
        });

    }, [newMentions, isGenerating, settings.ai?.enabled, agent, markAllRead]);

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

    // Save conversation to markdown file
    const handleSave = useCallback(async () => {
        try {
            // Check if there's anything to save
            if (historyItems.length === 0) {
                new Notice('No conversation to save');
                return;
            }

            // Get the folder where the current file is located
            const activeFile = app.workspace.getActiveFile();
            const folder = getColocationFolder(app, activeFile ?? undefined);
            const folderPath = folder.path;

            // Generate filename with timestamp
            const now = new Date();
            const timestamp = now.toISOString()
                .replace(/[-:]/g, '')
                .replace('T', '-')
                .slice(0, 15);
            const filename = `conversation-${timestamp}.md`;

            // Format conversation to markdown
            const modelName = agent.$modelName.get();
            const markdown = formatConversationToMarkdown(historyItems, {
                modelName,
            });

            // Ensure folder exists
            await checkAndCreateFolder(folderPath, app.vault);

            // Get unique filepath (handles duplicates)
            const filepath = getNewUniqueFilepath(app.vault, filename, folderPath);

            // Create the file
            await app.vault.create(filepath, markdown);

            new Notice(`Conversation saved: ${filepath}`);
        } catch (error) {
            console.error('Error saving conversation:', error);
            new Notice('Failed to save conversation');
        }
    }, [app, historyItems, agent]);

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
                                onClick={handleSave}
                                disabled={historyItems.length === 0}
                                aria-label="Save conversation"
                                title="Save conversation"
                            >
                                <DownloadIcon />
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
