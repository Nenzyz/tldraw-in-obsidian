import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import { Editor, useValue } from 'tldraw';
import { TldrawAgent } from '../../ai/agent/TldrawAgent';
import { AGENT_MODEL_DEFINITIONS, AgentModelName } from '../../ai/models';
import { AgentIcon, ChevronDownIcon } from './icons/AgentIcon';
import { AtIcon } from './icons/AtIcon';
import { SelectionTag } from './tags/SelectionTag';
import { ContextItemTag } from './tags/ContextItemTag';

export interface ChatInputProps {
    agent: TldrawAgent;
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

// Context actions for the "Add Context" dropdown
const ADD_CONTEXT_ACTIONS = [
    {
        name: 'Pick Shapes',
        onSelect: (editor: Editor) => {
            editor.setCurrentTool('target-shape');
            editor.focus();
        },
    },
    {
        name: 'Pick Area',
        onSelect: (editor: Editor) => {
            editor.setCurrentTool('target-area');
            editor.focus();
        },
    },
    {
        name: ' ',
        onSelect: (editor: Editor) => {
            const currentTool = editor.getCurrentTool();
            if (currentTool.id === 'target-area' || currentTool.id === 'target-shape') {
                editor.setCurrentTool('select');
            }
        },
    },
];

export function ChatInput({
    agent,
    onSubmit,
    onCancel,
    isLoading = false,
    disabled = false,
    placeholder = 'Ask the AI assistant...',
}: ChatInputProps) {
    const { editor } = agent;
    const [inputValue, setInputValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Subscribe to model name from agent state
    const modelName = useValue('modelName', () => agent.$modelName.get(), [agent]);

    // Check if context tool is currently active
    const isContextToolActive = useValue(
        'isContextToolActive',
        () => {
            const tool = editor.getCurrentTool();
            return tool.id === 'target-shape' || tool.id === 'target-area';
        },
        [editor]
    );

    // Get selected shapes from editor
    const selectedShapes = useValue('selectedShapes', () => editor.getSelectedShapes(), [editor]);

    // Get context items from agent
    const contextItems = useValue('contextItems', () => agent.$contextItems.get(), [agent]);

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

    const handleModelChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        agent.$modelName.set(event.target.value as AgentModelName);
    }, [agent]);

    const handleContextSelectChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const action = ADD_CONTEXT_ACTIONS.find((action) => action.name === event.target.value);
        if (action) {
            action.onSelect(editor);
        }
    }, [editor]);

    const handleClearSelection = useCallback(() => {
        editor.selectNone();
    }, [editor]);

    const handleRemoveContextItem = useCallback((item: typeof contextItems[number]) => {
        agent.removeFromContext(item);
    }, [agent]);

    const canSubmit = inputValue.trim().length > 0 && !isLoading && !disabled;

    return (
        <div className="ptl-chat-input-container">
            {/* Prompt Tags Section */}
            <div className="ptl-prompt-tags">
                {/* Add Context Selector */}
                <div className={'ptl-chat-context-select ' + (isContextToolActive ? 'active' : '')}>
                    <div className="ptl-chat-context-select-label">
                        <AtIcon /> Add Context
                    </div>
                    <select
                        id="chat-context-select"
                        value=" "
                        onChange={handleContextSelectChange}
                        aria-label="Add context to prompt"
                    >
                        {ADD_CONTEXT_ACTIONS.map((action) => (
                            <option key={action.name} value={action.name}>
                                {action.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Selection Tag - shows when shapes are selected */}
                {selectedShapes.length > 0 && (
                    <SelectionTag onClick={handleClearSelection} />
                )}

                {/* Context Item Tags - shows for each context item */}
                {contextItems.map((item, i) => (
                    <ContextItemTag
                        key={'context-item-' + i}
                        item={item}
                        editor={editor}
                        onClick={() => handleRemoveContextItem(item)}
                    />
                ))}
            </div>

            {/* Input Row with textarea and submit button */}
            <div className="ptl-chat-input-row">
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

            {/* Actions Row with model selector */}
            <div className="ptl-chat-actions">
                <div className="ptl-chat-actions-left">
                    <div className="ptl-chat-model-select">
                        <div className="ptl-chat-model-select-label">
                            <AgentIcon type="brain" />
                            <span>{modelName}</span>
                        </div>
                        <select
                            value={modelName}
                            onChange={handleModelChange}
                            aria-label="Select AI model"
                        >
                            {Object.values(AGENT_MODEL_DEFINITIONS)
                                .filter((model) => !('hidden' in model && model.hidden))
                                .map((model) => (
                                <option key={model.name} value={model.name}>
                                    {model.name}
                                </option>
                            ))}
                        </select>
                        <ChevronDownIcon />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ChatInput;
