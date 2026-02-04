import { Editor, createShapeId, TLShapeId, TLShape } from 'tldraw';
import type { TLCommentShape, Reply, CommentStatus } from '../CommentShape';

/**
 * Create a new comment shape on the canvas
 *
 * @param editor - Tldraw editor instance
 * @param position - Canvas position for the comment
 * @param author - Author name/ID
 * @param options - Optional binding and offset data
 * @returns The ID of the created comment shape
 */
export function createComment(
	editor: Editor,
	position: { x: number; y: number },
	author: string,
	options?: {
		boundShapeId?: string;
		offset?: { x: number; y: number };
	}
): TLShapeId {
	const id = createShapeId();
	const now = Date.now();

	editor.createShape<TLCommentShape>({
		id,
		type: 'comment',
		x: position.x,
		y: position.y,
		props: {
			author,
			createdAt: now,
			lastModified: now,
			status: 'open',
			replies: [],
			boundShapeId: options?.boundShapeId,
			offset: options?.offset,
			w: 32,
			h: 32,
			color: 'black',
		},
	});

	return id;
}

/**
 * Add a reply to an existing comment
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape
 * @param reply - Reply object to add
 */
export function addReply(editor: Editor, commentId: TLShapeId, reply: Reply): void {
	const comment = editor.getShape<TLCommentShape>(commentId);
	if (!comment || comment.type !== 'comment') {
		throw new Error(`Comment shape not found: ${commentId}`);
	}

	const updatedReplies = [...comment.props.replies, reply];
	const now = Date.now();

	editor.updateShape<TLCommentShape>({
		id: commentId,
		type: 'comment',
		props: {
			...comment.props,
			replies: updatedReplies,
			lastModified: now,
		},
	});
}

/**
 * Update the status of a comment
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape
 * @param status - New status ('open' | 'resolved')
 */
export function updateCommentStatus(
	editor: Editor,
	commentId: TLShapeId,
	status: CommentStatus
): void {
	const comment = editor.getShape<TLCommentShape>(commentId);
	if (!comment || comment.type !== 'comment') {
		throw new Error(`Comment shape not found: ${commentId}`);
	}

	const now = Date.now();

	editor.updateShape<TLCommentShape>({
		id: commentId,
		type: 'comment',
		props: {
			...comment.props,
			status,
			lastModified: now,
		},
	});
}

/**
 * Get all replies for a comment
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape
 * @returns Array of replies
 */
export function getCommentReplies(editor: Editor, commentId: TLShapeId): Reply[] {
	const comment = editor.getShape<TLCommentShape>(commentId);
	if (!comment || comment.type !== 'comment') {
		return [];
	}
	return comment.props.replies;
}

/**
 * Extract @mentions from reply text
 *
 * @param text - Reply message text
 * @returns Array of mention strings (e.g., ['@User1', '@AI', '@Shape123'])
 */
export function extractMentions(text: string): string[] {
	// Match @mentions - word characters, numbers, underscores, hyphens
	const mentionRegex = /@([\w\d_-]+)/g;
	const matches = text.matchAll(mentionRegex);
	return Array.from(matches, (match) => match[0]);
}

/**
 * Update the lastModified timestamp on a comment
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape
 */
export function updateLastModified(editor: Editor, commentId: TLShapeId): void {
	const comment = editor.getShape<TLCommentShape>(commentId);
	if (!comment || comment.type !== 'comment') {
		throw new Error(`Comment shape not found: ${commentId}`);
	}

	const now = Date.now();

	editor.updateShape<TLCommentShape>({
		id: commentId,
		type: 'comment',
		props: {
			...comment.props,
			lastModified: now,
		},
	});
}

/**
 * Delete a comment shape from the canvas
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape to delete
 */
export function deleteComment(editor: Editor, commentId: TLShapeId): void {
	const comment = editor.getShape<TLCommentShape>(commentId);
	if (!comment || comment.type !== 'comment') {
		throw new Error(`Comment shape not found: ${commentId}`);
	}

	editor.deleteShape(commentId);
}

/**
 * Edit a reply message
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape
 * @param replyId - ID of the reply to edit
 * @param newMessage - New message text
 */
export function editReply(
	editor: Editor,
	commentId: TLShapeId,
	replyId: string,
	newMessage: string
): void {
	const comment = editor.getShape<TLCommentShape>(commentId);
	if (!comment || comment.type !== 'comment') {
		throw new Error(`Comment shape not found: ${commentId}`);
	}

	const updatedReplies = comment.props.replies.map(reply =>
		reply.id === replyId
			? { ...reply, message: newMessage, timestamp: Date.now() }
			: reply
	);

	const now = Date.now();

	editor.updateShape<TLCommentShape>({
		id: commentId,
		type: 'comment',
		props: {
			...comment.props,
			replies: updatedReplies,
			lastModified: now,
		},
	});
}

/**
 * Delete a reply from a comment
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape
 * @param replyId - ID of the reply to delete
 */
export function deleteReply(
	editor: Editor,
	commentId: TLShapeId,
	replyId: string
): void {
	const comment = editor.getShape<TLCommentShape>(commentId);
	if (!comment || comment.type !== 'comment') {
		throw new Error(`Comment shape not found: ${commentId}`);
	}

	const updatedReplies = comment.props.replies.filter(reply => reply.id !== replyId);
	const now = Date.now();

	editor.updateShape<TLCommentShape>({
		id: commentId,
		type: 'comment',
		props: {
			...comment.props,
			replies: updatedReplies,
			lastModified: now,
		},
	});
}

// ==================== Binding Functions ====================

/**
 * Bind a comment to a target shape
 *
 * Calculates the offset from the comment's current position to the target shape's
 * position and stores both the boundShapeId and offset in the comment's props.
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape to bind
 * @param targetShapeId - ID of the shape to bind to
 */
export function bindCommentToShape(
	editor: Editor,
	commentId: TLShapeId,
	targetShapeId: TLShapeId
): void {
	const comment = editor.getShape<TLCommentShape>(commentId);
	const targetShape = editor.getShape(targetShapeId);

	if (!comment || comment.type !== 'comment') {
		throw new Error(`Comment shape not found: ${commentId}`);
	}

	if (!targetShape) {
		throw new Error(`Target shape not found: ${targetShapeId}`);
	}

	// Calculate offset from comment position to target shape position
	const offset = {
		x: comment.x - targetShape.x,
		y: comment.y - targetShape.y,
	};

	// Update comment with binding data
	editor.updateShape<TLCommentShape>({
		id: commentId,
		type: 'comment',
		props: {
			...comment.props,
			boundShapeId: targetShapeId,
			offset,
		},
	});
}

/**
 * Remove binding from a comment
 *
 * Clears the boundShapeId and offset from the comment, making it free-floating.
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape to unbind
 */
export function unbindComment(editor: Editor, commentId: TLShapeId): void {
	const comment = editor.getShape<TLCommentShape>(commentId);

	if (!comment || comment.type !== 'comment') {
		throw new Error(`Comment shape not found: ${commentId}`);
	}

	// Remove binding data
	editor.updateShape<TLCommentShape>({
		id: commentId,
		type: 'comment',
		props: {
			...comment.props,
			boundShapeId: undefined,
			offset: undefined,
		},
	});
}

/**
 * Update comment position based on its binding
 *
 * If the comment is bound to a shape, recalculates the comment's position
 * based on the bound shape's current position and the stored offset.
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape to update
 * @returns True if position was updated, false if comment is not bound
 */
export function updateCommentPositionFromBinding(
	editor: Editor,
	commentId: TLShapeId
): boolean {
	const comment = editor.getShape<TLCommentShape>(commentId);

	if (!comment || comment.type !== 'comment') {
		throw new Error(`Comment shape not found: ${commentId}`);
	}

	// If not bound, no update needed
	if (!comment.props.boundShapeId || !comment.props.offset) {
		return false;
	}

	const targetShape = editor.getShape(comment.props.boundShapeId as any);

	// If target shape doesn't exist, unbind the comment
	if (!targetShape) {
		unbindComment(editor, commentId);
		return false;
	}

	// Calculate new position based on target shape position + offset
	const newX = targetShape.x + comment.props.offset.x;
	const newY = targetShape.y + comment.props.offset.y;

	// Update comment position
	editor.updateShape<TLCommentShape>({
		id: commentId,
		type: 'comment',
		x: newX,
		y: newY,
	});

	return true;
}

/**
 * Check if a comment should be unbound based on distance from its bound shape
 *
 * Calculates the distance between the comment and its bound shape. If the distance
 * exceeds the threshold, the comment should be unbound.
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment shape
 * @param threshold - Distance threshold in pixels (default: 100)
 * @returns True if comment should be unbound
 */
export function shouldUnbindComment(
	editor: Editor,
	commentId: TLShapeId,
	threshold: number = 100
): boolean {
	const comment = editor.getShape<TLCommentShape>(commentId);

	if (!comment || comment.type !== 'comment' || !comment.props.boundShapeId) {
		return false;
	}

	const targetShape = editor.getShape(comment.props.boundShapeId as any);
	if (!targetShape) {
		return true; // Unbind if target shape doesn't exist
	}

	// Calculate distance between comment and target shape centers
	const commentCenterX = comment.x + comment.props.w / 2;
	const commentCenterY = comment.y + comment.props.h / 2;

	// Get target shape bounds
	const targetBounds = editor.getShapeGeometry(targetShape).bounds;
	const targetCenterX = targetShape.x + targetBounds.width / 2;
	const targetCenterY = targetShape.y + targetBounds.height / 2;

	const distance = Math.sqrt(
		Math.pow(commentCenterX - targetCenterX, 2) + Math.pow(commentCenterY - targetCenterY, 2)
	);

	return distance > threshold;
}

/**
 * Get all comments bound to a specific shape
 *
 * @param editor - Tldraw editor instance
 * @param shapeId - ID of the shape
 * @returns Array of comment shapes bound to the shape
 */
export function getCommentsForShape(editor: Editor, shapeId: TLShapeId): TLCommentShape[] {
	const allShapes = editor.getCurrentPageShapes();
	const comments: TLCommentShape[] = [];

	for (const shape of allShapes) {
		if (shape.type === 'comment') {
			const comment = shape as TLCommentShape;
			if (comment.props.boundShapeId === shapeId) {
				comments.push(comment);
			}
		}
	}

	return comments;
}
