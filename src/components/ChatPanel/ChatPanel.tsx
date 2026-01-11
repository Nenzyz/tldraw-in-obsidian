import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, ChatMessageData } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useTldrawSettings } from 'src/contexts/tldraw-settings-context';
import {
    streamMessage,
    CancellationToken,
    AnthropicError,
} from 'src/ai/anthropic-client';

export interface ChatPanelProps {
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

// Generate unique message ID
function generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function ChatPanel({
    defaultCollapsed = true,
    onOpenChange,
    isOpen: controlledIsOpen,
}: ChatPanelProps) {
    const { settings } = useTldrawSettings();
    const [internalIsOpen, setInternalIsOpen] = useState(!defaultCollapsed);
    const [messages, setMessages] = useState<ChatMessageData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentStreamingMessage, setCurrentStreamingMessage] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const cancellationTokenRef = useRef<CancellationToken | null>(null);

    // Use controlled or uncontrolled mode
    const isPanelOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

    // Scroll to bottom when new messages arrive
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, currentStreamingMessage, scrollToBottom]);

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
        const apiKey = settings.ai?.apiKey;
        const model = settings.ai?.model;
        const maxTokens = settings.ai?.maxTokens || 4096;

        if (!apiKey) {
            // Add error message
            const errorMessage: ChatMessageData = {
                id: generateMessageId(),
                role: 'assistant',
                content: 'Please configure your API key in the AI settings to use the assistant.',
                isError: true,
            };
            setMessages(prev => [...prev, errorMessage]);
            return;
        }

        if (!model) {
            const errorMessage: ChatMessageData = {
                id: generateMessageId(),
                role: 'assistant',
                content: 'Please select an AI model in the settings.',
                isError: true,
            };
            setMessages(prev => [...prev, errorMessage]);
            return;
        }

        // Add user message
        const userMessage: ChatMessageData = {
            id: generateMessageId(),
            role: 'user',
            content,
        };
        setMessages(prev => [...prev, userMessage]);

        // Start loading
        setIsLoading(true);
        setCurrentStreamingMessage('');

        // Create cancellation token
        const cancellationToken = new CancellationToken();
        cancellationTokenRef.current = cancellationToken;

        // Build message history for API
        const apiMessages = [...messages, userMessage].map(msg => ({
            role: msg.role,
            content: msg.content,
        }));

        // System prompt for the AI assistant
        const systemPrompt = `You are a helpful AI assistant embedded in a tldraw whiteboard application within Obsidian.
You can help users with:
- General questions and tasks
- Understanding and working with their drawings
- Suggesting ideas and improvements

Be concise and helpful. Use markdown formatting when appropriate.`;

        let streamedContent = '';

        await streamMessage(
            apiKey,
            model,
            apiMessages,
            systemPrompt,
            maxTokens,
            {
                onText: (text) => {
                    streamedContent += text;
                    setCurrentStreamingMessage(streamedContent);
                },
                onComplete: (fullText) => {
                    // Add completed message
                    const assistantMessage: ChatMessageData = {
                        id: generateMessageId(),
                        role: 'assistant',
                        content: fullText,
                    };
                    setMessages(prev => [...prev, assistantMessage]);
                    setCurrentStreamingMessage('');
                    setIsLoading(false);
                    cancellationTokenRef.current = null;
                },
                onError: (error: AnthropicError) => {
                    // Add error message
                    const errorMessage: ChatMessageData = {
                        id: generateMessageId(),
                        role: 'assistant',
                        content: error.message,
                        isError: true,
                    };
                    setMessages(prev => [...prev, errorMessage]);
                    setCurrentStreamingMessage('');
                    setIsLoading(false);
                    cancellationTokenRef.current = null;
                },
            },
            cancellationToken
        );
    }, [settings.ai, messages]);

    const handleCancel = useCallback(() => {
        if (cancellationTokenRef.current) {
            cancellationTokenRef.current.cancel();

            // If there was partial content, save it as a message
            if (currentStreamingMessage) {
                const partialMessage: ChatMessageData = {
                    id: generateMessageId(),
                    role: 'assistant',
                    content: currentStreamingMessage + ' [cancelled]',
                };
                setMessages(prev => [...prev, partialMessage]);
            }

            setCurrentStreamingMessage('');
            setIsLoading(false);
            cancellationTokenRef.current = null;
        }
    }, [currentStreamingMessage]);

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
                        <button
                            className="ptl-chat-panel-close-btn"
                            onClick={handleClosePanel}
                            aria-label="Close chat panel"
                            title="Close"
                        >
                            <CloseIcon />
                        </button>
                    </div>
                    <div className="ptl-chat-panel-messages">
                        {messages.length === 0 && !currentStreamingMessage && (
                            <div className="ptl-chat-panel-empty">
                                <p>Ask me anything about your drawing or get help with ideas.</p>
                            </div>
                        )}
                        {messages.map(message => (
                            <ChatMessage key={message.id} message={message} />
                        ))}
                        {currentStreamingMessage && (
                            <ChatMessage
                                message={{
                                    id: 'streaming',
                                    role: 'assistant',
                                    content: currentStreamingMessage,
                                    isStreaming: true,
                                }}
                            />
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    <div className="ptl-chat-panel-input-area">
                        <ChatInput
                            onSubmit={handleSubmit}
                            onCancel={handleCancel}
                            isLoading={isLoading}
                            disabled={!settings.ai?.enabled}
                            placeholder={
                                !settings.ai?.enabled
                                    ? 'Enable AI in settings to use chat'
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
