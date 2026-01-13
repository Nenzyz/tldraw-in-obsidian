import { AgentIconType } from '../icons/AgentIcon';

export interface ChatHistoryInfo {
    icon: AgentIconType | null;
    description: string | null;
    summary: string | null;
    canGroup: (other: StreamingAction) => boolean;
}

// Action type that can be from Streaming<AgentAction>
export type StreamingAction = {
    _type?: string;
    complete: boolean;
    time: number;
} & Record<string, unknown>;

/**
 * Get display info for an action based on its type.
 * This maps action types to icons, descriptions, and grouping behavior.
 */
export function getActionInfo(action: StreamingAction): ChatHistoryInfo {
    const type = action._type;

    switch (type) {
        case 'think': {
            const text = (action as { text?: string }).text;
            const time = Math.floor(action.time / 1000);
            let summary = `Thought for ${time} seconds`;
            if (time === 0) summary = 'Thought for less than a second';
            if (time === 1) summary = 'Thought for 1 second';

            return {
                icon: 'brain',
                description: text ?? (action.complete ? 'Thinking...' : null),
                summary,
                canGroup: (other) => other._type === 'think',
            };
        }

        case 'message': {
            const text = (action as { text?: string }).text;
            return {
                icon: 'message',
                description: text ?? '',
                summary: null,
                canGroup: () => false,
            };
        }

        case 'create': {
            const intent = (action as { intent?: string }).intent;
            const shape = (action as { shape?: { _type?: string } }).shape;
            return {
                icon: 'pencil',
                description: intent ?? `Created ${shape?._type ?? 'shape'}`,
                summary: null,
                canGroup: (other) => other._type === 'create',
            };
        }

        case 'update': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'pencil',
                description: intent ?? 'Updated shape',
                summary: null,
                canGroup: (other) => other._type === 'update',
            };
        }

        case 'delete': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'trash',
                description: intent ?? 'Deleted shape',
                summary: null,
                canGroup: (other) => other._type === 'delete',
            };
        }

        case 'move': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'cursor',
                description: intent ?? 'Moved shape',
                summary: null,
                canGroup: (other) => other._type === 'move',
            };
        }

        case 'label': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'pencil',
                description: intent ?? 'Changed label',
                summary: null,
                canGroup: (other) => other._type === 'label',
            };
        }

        case 'review': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'eye',
                description: intent ?? 'Reviewing work',
                summary: null,
                canGroup: () => false,
            };
        }

        case 'update-todo-list': {
            const text = (action as { text?: string }).text;
            const status = (action as { status?: string }).status;
            const statusEmoji = status === 'done' ? '✓' : status === 'in-progress' ? '●' : '○';
            return {
                icon: 'list',
                description: `${statusEmoji} ${text ?? 'Todo item'}`,
                summary: null,
                canGroup: (other) => other._type === 'update-todo-list',
            };
        }

        case 'setMyView': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'eye',
                description: intent ?? 'Changed viewport',
                summary: null,
                canGroup: () => false,
            };
        }

        case 'place':
        case 'align':
        case 'distribute':
        case 'stack': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'target',
                description: intent ?? `${type} shapes`,
                summary: null,
                canGroup: (other) => other._type === type,
            };
        }

        case 'rotate':
        case 'resize': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'cursor',
                description: intent ?? `${type} shapes`,
                summary: null,
                canGroup: (other) => other._type === type,
            };
        }

        case 'bringToFront':
        case 'sendToBack': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'cursor',
                description: intent ?? 'Changed layer order',
                summary: null,
                canGroup: (other) => other._type === type,
            };
        }

        case 'pen': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'pencil',
                description: intent ?? 'Drew with pen',
                summary: null,
                canGroup: (other) => other._type === 'pen',
            };
        }

        case 'clear': {
            return {
                icon: 'trash',
                description: 'Cleared canvas',
                summary: null,
                canGroup: () => false,
            };
        }

        case 'add-detail': {
            const intent = (action as { intent?: string }).intent;
            return {
                icon: 'pencil',
                description: intent ?? 'Adding detail',
                summary: null,
                canGroup: () => false,
            };
        }

        default:
            return {
                icon: null,
                description: null,
                summary: null,
                canGroup: () => true,
            };
    }
}
