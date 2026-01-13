import React, { useCallback } from 'react';
import { useValue } from 'tldraw';
import { TldrawAgent } from 'src/ai/agent/TldrawAgent';
import { TodoItem } from 'src/ai/shared/types/TodoItem';

/**
 * Displays the agent's todo list with status indicators.
 * Positioned above ChatInput with rounded container styling.
 */
export function TodoList({ agent }: { agent: TldrawAgent }) {
    const todoItems = useValue('todoList', () => agent.$todoList.get(), [agent]);

    // Only show incomplete items (todo or in-progress)
    // Done items are hidden like in the original template-agent
    const activeItems = todoItems.filter(item => item.status !== 'done');

    if (activeItems.length === 0) {
        return null;
    }

    return (
        <div className="ptl-todo-list">
            <div className="ptl-todo-list-items">
                {activeItems.map((item) => (
                    <TodoListItem key={item.id} agent={agent} item={item} />
                ))}
            </div>
        </div>
    );
}

function TodoListItem({ agent, item }: { agent: TldrawAgent; item: TodoItem }) {
    const deleteTodo = useCallback(() => {
        agent.$todoList.update((items) => items.filter((i) => i.id !== item.id));
    }, [item.id, agent.$todoList]);

    // Status icons matching template-agent:
    // - todo: circle (○) - text-3 color
    // - in-progress: right-arrow (➤) - primary blue
    // - done: filled-circle (●) - green color
    const getStatusIcon = (status: TodoItem['status']) => {
        switch (status) {
            case 'todo':
                return '○';
            case 'in-progress':
                return '➤';
            case 'done':
                return '●';
        }
    };

    const icon = getStatusIcon(item.status);

    return (
        <div className={`ptl-todo-item ptl-todo-item-${item.status}`}>
            <span className="ptl-todo-item-icon">{icon}</span>
            <span className="ptl-todo-item-text">{item.text}</span>
            <button className="ptl-todo-item-delete" onClick={deleteTodo}>
                ×
            </button>
        </div>
    );
}
