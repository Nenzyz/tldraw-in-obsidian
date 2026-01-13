import React from 'react';
import { AtIcon } from './AtIcon';
import { TickIcon } from './TickIcon';
import { SmallSpinner } from './SmallSpinner';

// Brain icon for thinking
const BrainIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
);

// Pencil icon for create/update
const PencilIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
);

// Trash icon for delete
const TrashIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <path d="M3 6h18"/>
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
    </svg>
);

// Move/cursor icon
const CursorIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
        <path d="m13 13 6 6"/>
    </svg>
);

// Eye icon for review/view
const EyeIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>
);

// Note/sticky icon
const NoteIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/>
        <path d="M15 3v4a2 2 0 0 0 2 2h4"/>
    </svg>
);

// Target icon for place/align
const TargetIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
    </svg>
);

// Message/chat icon
const MessageIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
    </svg>
);

// List/todo icon
const ListIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <line x1="8" x2="21" y1="6" y2="6"/>
        <line x1="8" x2="21" y1="12" y2="12"/>
        <line x1="8" x2="21" y1="18" y2="18"/>
        <line x1="3" x2="3.01" y1="6" y2="6"/>
        <line x1="3" x2="3.01" y1="12" y2="12"/>
        <line x1="3" x2="3.01" y1="18" y2="18"/>
    </svg>
);

// Cross icon for close/cancel
const CrossIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ptl-chat-icon">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </svg>
);

// Refresh icon for retry/reload
const RefreshIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ptl-chat-icon">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
    </svg>
);

// Ellipsis icon for more options
const EllipsisIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ptl-chat-icon">
        <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
        <path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
        <path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    </svg>
);

// Search icon
const SearchIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ptl-chat-icon">
        <path d="m21 21-4.34-4.34" />
        <circle cx="11" cy="11" r="8" />
    </svg>
);

// Comment icon for messages
const CommentIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ptl-chat-icon">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
);

// Chevron icons for collapse/expand
export const ChevronRightIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <path d="m9 18 6-6-6-6"/>
    </svg>
);

export const ChevronDownIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ptl-chat-icon">
        <path d="m6 9 6 6 6-6"/>
    </svg>
);

const AGENT_ICONS = {
    brain: <BrainIcon />,
    pencil: <PencilIcon />,
    trash: <TrashIcon />,
    cursor: <CursorIcon />,
    eye: <EyeIcon />,
    note: <NoteIcon />,
    target: <TargetIcon />,
    message: <MessageIcon />,
    list: <ListIcon />,
    at: <AtIcon />,
    tick: <TickIcon />,
    spinner: <SmallSpinner />,
    cross: <CrossIcon />,
    refresh: <RefreshIcon />,
    ellipsis: <EllipsisIcon />,
    search: <SearchIcon />,
    comment: <CommentIcon />,
    'chevron-right': <ChevronRightIcon />,
    'chevron-down': <ChevronDownIcon />,
} as const;

export type AgentIconType = keyof typeof AGENT_ICONS;

export function AgentIcon({ type }: { type: AgentIconType }) {
    return AGENT_ICONS[type] || null;
}
