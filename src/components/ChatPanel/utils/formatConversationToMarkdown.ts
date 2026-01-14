import { ChatHistoryItem } from '../chat-history/ChatHistory';
import { getActionInfo, StreamingAction } from '../chat-history/getActionInfo';

export interface FormatOptions {
    /** Title for the conversation document */
    title?: string;
    /** Model name to include in metadata */
    modelName?: string;
}

/**
 * Format a user prompt message with a header and admonition for outline navigation and visual distinction.
 */
function formatUserPrompt(message: string): string {
    const lines = message.split('\n');
    const quotedLines = lines.map(line => `> ${line}`);
    return `## User\n\n> [!note]\n${quotedLines.join('\n')}`;
}

/**
 * Format a thought action as an Obsidian admonition block.
 */
function formatThought(text: string, timeSeconds: number): string {
    const timeLabel = timeSeconds === 0 
        ? 'less than a second' 
        : timeSeconds === 1 
            ? '1 second' 
            : `${timeSeconds} seconds`;
    const lines = text.split('\n');
    const quotedLines = lines.map(line => `> ${line}`);
    return `> [!tip] Thought for ${timeLabel}\n${quotedLines.join('\n')}`;
}

/**
 * Check if an action is a thought type
 */
function isThought(action: StreamingAction): boolean {
    return action._type === 'think';
}

/**
 * Check if an action is a todo update
 */
function isTodoAction(action: StreamingAction): boolean {
    return action._type === 'update-todo-list';
}

/**
 * Get description for a regular action (non-thought, non-todo)
 */
function getActionDescription(action: StreamingAction): string | null {
    const info = getActionInfo(action);
    return info.description;
}

/**
 * Format a group of consecutive actions into markdown.
 * All under Assistant header: thoughts as admonitions, actions as list, todos as list.
 */
function formatActionGroup(actions: StreamingAction[]): string {
    const parts: string[] = [];
    
    // Separate actions by type
    const thoughts: StreamingAction[] = [];
    const todos: StreamingAction[] = [];
    const regularActions: StreamingAction[] = [];
    
    for (const action of actions) {
        if (isThought(action)) {
            thoughts.push(action);
        } else if (isTodoAction(action)) {
            todos.push(action);
        } else {
            regularActions.push(action);
        }
    }
    
    // Check if we have any content to output
    const hasThoughts = thoughts.some(t => (t as { text?: string }).text);
    const actionDescriptions = regularActions
        .map(action => getActionDescription(action))
        .filter((desc): desc is string => desc !== null);
    const hasTodos = todos.some(t => (t as { text?: string }).text);
    
    if (!hasThoughts && actionDescriptions.length === 0 && !hasTodos) {
        return '';
    }
    
    // Start Assistant section
    parts.push('## Assistant');
    parts.push('');
    
    // Format thoughts as admonitions (under Assistant)
    for (const thought of thoughts) {
        const text = (thought as { text?: string }).text;
        if (text) {
            const timeSeconds = Math.floor(thought.time / 1000);
            parts.push(formatThought(text, timeSeconds));
            parts.push('');
        }
    }
    
    // Format regular actions as a single list
    if (actionDescriptions.length > 0) {
        for (const desc of actionDescriptions) {
            parts.push(`- ${desc}`);
        }
        parts.push('');
    }
    
    // Format todos as a single list
    if (hasTodos) {
        parts.push('**Todo Updates:**');
        for (const todo of todos) {
            const text = (todo as { text?: string }).text;
            const status = (todo as { status?: string }).status;
            const statusEmoji = status === 'done' ? '✓' : status === 'in-progress' ? '●' : '○';
            if (text) {
                parts.push(`- ${statusEmoji} ${text}`);
            }
        }
        parts.push('');
    }
    
    return parts.join('\n');
}

/**
 * Format conversation history items into a readable markdown document.
 * User messages use headers for outline navigation.
 * Assistant actions are grouped into single lists.
 * Thoughts are formatted as admonitions.
 * 
 * @param historyItems - Array of chat history items (prompts and actions)
 * @param options - Optional formatting options
 * @returns Formatted markdown string
 */
export function formatConversationToMarkdown(
    historyItems: ChatHistoryItem[],
    options: FormatOptions = {}
): string {
    const parts: string[] = [];
    
    // Add header with metadata
    const now = new Date();
    const timestamp = now.toLocaleString();
    const title = options.title || `Conversation - ${timestamp}`;
    
    parts.push(`# ${title}`);
    parts.push('');
    
    // Add metadata section
    parts.push(`**Saved:** ${timestamp}`);
    if (options.modelName) {
        parts.push(`**Model:** ${options.modelName}`);
    }
    parts.push('');
    parts.push('---');
    parts.push('');
    
    // Group items: collect actions between prompts
    let currentActions: StreamingAction[] = [];
    
    for (const item of historyItems) {
        if (item.type === 'prompt') {
            // Output any pending actions before this prompt
            if (currentActions.length > 0) {
                parts.push(formatActionGroup(currentActions));
                currentActions = [];
            }
            // Output the user prompt
            parts.push(formatUserPrompt(item.message));
            parts.push('');
        } else if (item.type === 'action') {
            // Collect actions to group them
            currentActions.push(item.action as StreamingAction);
        }
    }
    
    // Output any remaining actions
    if (currentActions.length > 0) {
        parts.push(formatActionGroup(currentActions));
    }
    
    return parts.join('\n');
}
