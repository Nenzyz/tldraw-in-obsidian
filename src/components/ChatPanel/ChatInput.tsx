import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';

export interface ChatInputProps {
    onSubmit: (message: string) => void;
    onCancel?: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    placeholder?: string;
}

// Send icon SVG
const SendIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
);

// Cancel/Stop icon SVG
const StopIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
    </svg>
);

export function ChatInput({
    onSubmit,
    onCancel,
    isLoading = false,
    disabled = false,
    placeholder = 'Ask the AI assistant...',
}: ChatInputProps) {
    const [inputValue, setInputValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea based on content
    const adjustTextareaHeight = useCallback(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            const maxHeight = 120; // Max height before scrolling
            const newHeight = Math.min(textarea.scrollHeight, maxHeight);
            textarea.style.height = `${newHeight}px`;
        }
    }, []);

    useEffect(() => {
        adjustTextareaHeight();
    }, [inputValue, adjustTextareaHeight]);

    const handleSubmit = useCallback(() => {
        const trimmedValue = inputValue.trim();
        if (trimmedValue && !isLoading && !disabled) {
            onSubmit(trimmedValue);
            setInputValue('');
        }
    }, [inputValue, isLoading, disabled, onSubmit]);

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit]);

    const handleCancel = useCallback(() => {
        if (onCancel) {
            onCancel();
        }
    }, [onCancel]);

    const canSubmit = inputValue.trim().length > 0 && !isLoading && !disabled;

    return (
        <div className="ptl-chat-input-container">
            <textarea
                ref={textareaRef}
                className="ptl-chat-input-textarea"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                aria-label="Chat message input"
            />
            <div className="ptl-chat-input-actions">
                {isLoading ? (
                    <button
                        className="ptl-chat-input-btn ptl-chat-cancel-btn"
                        onClick={handleCancel}
                        aria-label="Cancel generation"
                        title="Cancel"
                    >
                        <StopIcon />
                    </button>
                ) : (
                    <button
                        className="ptl-chat-input-btn ptl-chat-submit-btn"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        aria-label="Send message"
                        title="Send (Enter)"
                    >
                        <SendIcon />
                    </button>
                )}
            </div>
        </div>
    );
}

export default ChatInput;
