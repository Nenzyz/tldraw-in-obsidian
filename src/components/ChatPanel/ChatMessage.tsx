import React from 'react';

export interface ChatMessageData {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    isError?: boolean;
}

export interface ChatMessageProps {
    message: ChatMessageData;
}

// Simple markdown-like formatting for messages using safe React elements
function formatMessage(content: string): React.ReactNode {
    // Split by code blocks first
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            // Code block
            const code = part.slice(3, -3);
            const lines = code.split('\n');
            const language = lines[0].trim();
            const codeContent = language ? lines.slice(1).join('\n') : code;

            return (
                <pre key={index} className="ptl-chat-code-block">
                    <code>{codeContent.trim()}</code>
                </pre>
            );
        }

        // Process inline formatting
        return (
            <span key={index}>
                {processInlineFormatting(part)}
            </span>
        );
    });
}

function processInlineFormatting(text: string): React.ReactNode {
    // Split by inline code
    const parts = text.split(/(`[^`]+`)/g);

    return parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={index} className="ptl-chat-inline-code">
                    {part.slice(1, -1)}
                </code>
            );
        }

        // Process bold, italic and newlines safely using React elements
        return processFormattedText(part, index);
    });
}

function processFormattedText(text: string, keyPrefix: number | string): React.ReactNode {
    const elements: React.ReactNode[] = [];
    let currentIndex = 0;
    let key = 0;

    // Regular expression to match bold (**text**), italic (*text*), or newlines
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|\n)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > currentIndex) {
            elements.push(
                <span key={`${keyPrefix}-${key++}`}>
                    {text.slice(currentIndex, match.index)}
                </span>
            );
        }

        const matchedText = match[0];

        if (matchedText === '\n') {
            elements.push(<br key={`${keyPrefix}-${key++}`} />);
        } else if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
            // Bold
            elements.push(
                <strong key={`${keyPrefix}-${key++}`}>
                    {matchedText.slice(2, -2)}
                </strong>
            );
        } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
            // Italic
            elements.push(
                <em key={`${keyPrefix}-${key++}`}>
                    {matchedText.slice(1, -1)}
                </em>
            );
        }

        currentIndex = match.index + matchedText.length;
    }

    // Add remaining text
    if (currentIndex < text.length) {
        elements.push(
            <span key={`${keyPrefix}-${key++}`}>
                {text.slice(currentIndex)}
            </span>
        );
    }

    return elements.length > 0 ? elements : text;
}

// Streaming indicator component
const StreamingIndicator = () => (
    <span className="ptl-chat-streaming-indicator">
        <span className="ptl-chat-streaming-dot"></span>
        <span className="ptl-chat-streaming-dot"></span>
        <span className="ptl-chat-streaming-dot"></span>
    </span>
);

export function ChatMessage({ message }: ChatMessageProps) {
    const isUser = message.role === 'user';

    const messageClasses = [
        'ptl-chat-message',
        isUser ? 'ptl-chat-message-user' : 'ptl-chat-message-assistant',
        message.isError ? 'ptl-chat-message-error' : '',
        message.isStreaming ? 'ptl-chat-message-streaming' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={messageClasses}>
            <div className="ptl-chat-message-content">
                {formatMessage(message.content)}
                {message.isStreaming && <StreamingIndicator />}
            </div>
        </div>
    );
}

export default ChatMessage;
