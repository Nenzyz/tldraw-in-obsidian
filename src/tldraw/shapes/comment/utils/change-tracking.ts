import { Editor } from 'tldraw';
import type { TLCommentShape, Reply, Mention } from '../CommentShape';

/**
 * Result type for getMentionsSince query
 */
export interface MentionResult {
	comment: TLCommentShape;
	replies: Reply[];
}

/**
 * Get all comments created after the given timestamp
 *
 * @param editor - Tldraw editor instance
 * @param timestamp - Unix milliseconds timestamp
 * @returns Array of comment shapes created after timestamp
 */
export function getCommentsSince(editor: Editor, timestamp: number): TLCommentShape[] {
	const allShapes = editor.getCurrentPageShapes();
	const comments: TLCommentShape[] = [];

	for (const shape of allShapes) {
		if (shape.type === 'comment') {
			const comment = shape as TLCommentShape;
			if (comment.props.createdAt > timestamp) {
				comments.push(comment);
			}
		}
	}

	return comments;
}

/**
 * Get all comments that have been modified (new replies) after the given timestamp
 *
 * @param editor - Tldraw editor instance
 * @param timestamp - Unix milliseconds timestamp
 * @returns Array of comment shapes with modifications after timestamp
 */
export function getCommentsModifiedSince(editor: Editor, timestamp: number): TLCommentShape[] {
	const allShapes = editor.getCurrentPageShapes();
	const comments: TLCommentShape[] = [];

	for (const shape of allShapes) {
		if (shape.type === 'comment') {
			const comment = shape as TLCommentShape;
			if (comment.props.lastModified > timestamp) {
				comments.push(comment);
			}
		}
	}

	return comments;
}

/**
 * Get all mentions of a specific mention ID after the given timestamp
 *
 * @param editor - Tldraw editor instance
 * @param timestamp - Unix milliseconds timestamp
 * @param mentionId - ID to search for (e.g., 'AI' for @AI mentions)
 * @returns Array of results containing comment and replies with mentions
 */
export function getMentionsSince(
	editor: Editor,
	timestamp: number,
	mentionId: string
): MentionResult[] {
	const allShapes = editor.getCurrentPageShapes();
	const results: MentionResult[] = [];

	for (const shape of allShapes) {
		if (shape.type === 'comment') {
			const comment = shape as TLCommentShape;

			// Find replies with mentions after timestamp
			const repliesWithMentions = comment.props.replies.filter((reply) => {
				if (reply.timestamp <= timestamp) return false;

				// Check if reply has the specific mention
				return reply.mentions.some(
					(mention) => mention.id === mentionId || mention.displayName === mentionId
				);
			});

			if (repliesWithMentions.length > 0) {
				results.push({
					comment,
					replies: repliesWithMentions,
				});
			}
		}
	}

	return results;
}

/**
 * Get all comments with status 'open'
 *
 * @param editor - Tldraw editor instance
 * @returns Array of unresolved comment shapes
 */
export function getUnresolvedComments(editor: Editor): TLCommentShape[] {
	const allShapes = editor.getCurrentPageShapes();
	const comments: TLCommentShape[] = [];

	for (const shape of allShapes) {
		if (shape.type === 'comment') {
			const comment = shape as TLCommentShape;
			if (comment.props.status === 'open') {
				comments.push(comment);
			}
		}
	}

	return comments;
}

/**
 * Get all comments created by a specific author
 *
 * @param editor - Tldraw editor instance
 * @param authorId - Author ID/name to filter by
 * @returns Array of comment shapes by the author
 */
export function getCommentsByAuthor(editor: Editor, authorId: string): TLCommentShape[] {
	const allShapes = editor.getCurrentPageShapes();
	const comments: TLCommentShape[] = [];

	for (const shape of allShapes) {
		if (shape.type === 'comment') {
			const comment = shape as TLCommentShape;
			if (comment.props.author === authorId) {
				comments.push(comment);
			}
		}
	}

	return comments;
}

/**
 * Build a delta summary string for agent context
 *
 * Provides a human-readable summary of comment activity since the last check,
 * including counts of new comments, replies, mentions, and active threads.
 *
 * @param editor - Tldraw editor instance
 * @param lastCheckedTimestamp - Unix milliseconds timestamp of last check
 * @returns Formatted summary string
 */
export function buildDeltaSummary(editor: Editor, lastCheckedTimestamp: number): string {
	const newComments = getCommentsSince(editor, lastCheckedTimestamp);
	const modifiedComments = getCommentsModifiedSince(editor, lastCheckedTimestamp);
	const aiMentions = getMentionsSince(editor, lastCheckedTimestamp, 'AI');
	const unresolvedComments = getUnresolvedComments(editor);

	// Count new replies
	let newRepliesCount = 0;
	for (const comment of modifiedComments) {
		const newReplies = comment.props.replies.filter(
			(reply) => reply.timestamp > lastCheckedTimestamp
		);
		newRepliesCount += newReplies.length;
	}

	// Find most active thread (highest reply count since last check)
	let mostActiveThread: { commentId: string; replyCount: number } | null = null;
	for (const comment of modifiedComments) {
		const newReplies = comment.props.replies.filter(
			(reply) => reply.timestamp > lastCheckedTimestamp
		);
		if (!mostActiveThread || newReplies.length > mostActiveThread.replyCount) {
			mostActiveThread = {
				commentId: comment.id,
				replyCount: newReplies.length,
			};
		}
	}

	// Build summary string
	const lines: string[] = [];

	// Prioritize @AI mentions first
	if (aiMentions.length > 0) {
		lines.push(
			`Since last check: ${newComments.length} new comments, ${newRepliesCount} new replies, ${aiMentions.length} @AI mentions`
		);
	} else {
		lines.push(
			`Since last check: ${newComments.length} new comments, ${newRepliesCount} new replies, 0 @AI mentions`
		);
	}

	lines.push(`Unresolved comments: ${unresolvedComments.length} total`);

	if (mostActiveThread && mostActiveThread.replyCount > 0) {
		lines.push(
			`Most active thread: Comment #${mostActiveThread.commentId} (${mostActiveThread.replyCount} new replies)`
		);
	}

	return lines.join('\n');
}
