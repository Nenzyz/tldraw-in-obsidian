import { useState, useEffect, useCallback } from 'react';
import { Editor, TLShapeId } from 'tldraw';
import { getMentionsSince, MentionResult } from '../tldraw/shapes/comment/utils/change-tracking';
import type { TLCommentShape } from '../tldraw/shapes/comment/CommentShape';

export interface MentionMonitorOptions {
	/** How often to check for new mentions (milliseconds). Default: 5000 (5 seconds) */
	pollInterval?: number;
	/** Mention ID to monitor (e.g., 'AI'). Default: 'AI' */
	mentionId?: string;
	/** Whether monitoring is enabled. Default: true */
	enabled?: boolean;
}

export interface UseMentionMonitorResult {
	/** New mentions since last check */
	newMentions: MentionResult[];
	/** Total count of unread mentions */
	unreadCount: number;
	/** Mark all mentions as read (updates lastChecked timestamp) */
	markAllRead: () => void;
	/** Mark a specific comment's mentions as read */
	markCommentRead: (commentId: TLShapeId) => void;
	/** Last checked timestamp */
	lastCheckedTimestamp: number;
}

const STORAGE_KEY_PREFIX = 'tldraw-mention-monitor';

/**
 * Hook to monitor @mentions in comments and track unread state
 * 
 * @example
 * ```tsx
 * const { newMentions, unreadCount, markAllRead } = useMentionMonitor(editor);
 * 
 * // Show badge with unread count
 * {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
 * 
 * // When user opens chat panel
 * <button onClick={markAllRead}>Open Chat</button>
 * ```
 */
export function useMentionMonitor(
	editor: Editor | null,
	options: MentionMonitorOptions = {}
): UseMentionMonitorResult {
	const {
		pollInterval = 5000,
		mentionId = 'AI',
		enabled = true,
	} = options;

	// Storage key specific to this editor instance
	const storageKey = `${STORAGE_KEY_PREFIX}-${mentionId}`;

	// Load last checked timestamp from localStorage
	const getInitialTimestamp = useCallback(() => {
		try {
			const stored = localStorage.getItem(storageKey);
			return stored ? parseInt(stored, 10) : Date.now();
		} catch {
			return Date.now();
		}
	}, [storageKey]);

	const [lastCheckedTimestamp, setLastCheckedTimestamp] = useState(getInitialTimestamp);
	const [newMentions, setNewMentions] = useState<MentionResult[]>([]);
	const [readComments, setReadComments] = useState<Set<string>>(new Set());

	// Save timestamp to localStorage
	const updateTimestamp = useCallback((timestamp: number) => {
		try {
			localStorage.setItem(storageKey, timestamp.toString());
		} catch {
			// Ignore localStorage errors
		}
		setLastCheckedTimestamp(timestamp);
	}, [storageKey]);

	// Mark all mentions as read
	const markAllRead = useCallback(() => {
		updateTimestamp(Date.now());
		setNewMentions([]);
		setReadComments(new Set());
	}, [updateTimestamp]);

	// Mark a specific comment as read
	const markCommentRead = useCallback((commentId: TLShapeId) => {
		setReadComments(prev => new Set(prev).add(commentId));
	}, []);

	// Poll for new mentions
	useEffect(() => {
		if (!editor || !enabled) {
			return;
		}

		const checkForMentions = () => {
			const mentions = getMentionsSince(editor, lastCheckedTimestamp, mentionId);
			
			// Filter out comments that have been marked as read
			const unreadMentions = mentions.filter(m => !readComments.has(m.comment.id));
			
			setNewMentions(unreadMentions);
		};

		// Check immediately
		checkForMentions();

		// Set up polling interval
		const intervalId = setInterval(checkForMentions, pollInterval);

		return () => {
			clearInterval(intervalId);
		};
	}, [editor, enabled, pollInterval, mentionId, lastCheckedTimestamp, readComments]);

	// Calculate unread count
	const unreadCount = newMentions.reduce((count, result) => {
		return count + result.replies.length;
	}, 0);

	return {
		newMentions,
		unreadCount,
		markAllRead,
		markCommentRead,
		lastCheckedTimestamp,
	};
}
