/**
 * Comment Binding Listeners
 *
 * Handles automatic comment position updates when bound shapes are moved/transformed
 * and automatic unbinding when bound shapes are deleted.
 */

import { Editor, TLShapeId } from 'tldraw';
import { TLCommentShape } from '../CommentShape';
import { updateCommentPositionFromBinding, unbindComment, getCommentsForShape } from './comment-helpers';

/**
 * Register binding update listeners for a comment shape
 *
 * Sets up listeners that will:
 * - Update comment position when bound shape moves
 * - Update comment position when bound shape transforms
 * - Unbind comment when bound shape is deleted
 *
 * @param editor - Tldraw editor instance
 * @returns Cleanup function to remove listeners
 */
export function registerCommentBindingListeners(editor: Editor): () => void {
	// Store previous shape states to detect changes
	const previousShapeStates = new Map<TLShapeId, { x: number; y: number }>();

	// Listen to store changes
	const removeListener = editor.store.listen(
		({ changes }) => {
			const { added, updated, removed } = changes;

			// Handle deleted shapes - unbind any comments bound to them
			for (const record of Object.values(removed)) {
				if (record.typeName === 'shape') {
					const shapeId = record.id as TLShapeId;
					const boundComments = getCommentsForShape(editor, shapeId);

					for (const comment of boundComments) {
						unbindComment(editor, comment.id);
					}
				}
			}

			// Handle updated shapes - update bound comment positions
			for (const [_from, to] of Object.values(updated)) {
				if (to.typeName === 'shape' && to.type !== 'comment') {
					const shapeId = to.id as TLShapeId;
					const shape = editor.getShape(shapeId);

					if (!shape) continue;

					// Check if position changed
					const prevState = previousShapeStates.get(shapeId);
					const positionChanged =
						!prevState || prevState.x !== shape.x || prevState.y !== shape.y;

					if (positionChanged) {
						// Update all comments bound to this shape
						const boundComments = getCommentsForShape(editor, shapeId);

						for (const comment of boundComments) {
							updateCommentPositionFromBinding(editor, comment.id);
						}

						// Update previous state
						previousShapeStates.set(shapeId, { x: shape.x, y: shape.y });
					}
				}
			}

			// Track added shapes
			for (const record of Object.values(added)) {
				if (record.typeName === 'shape' && record.type !== 'comment') {
					const shapeId = record.id as TLShapeId;
					const shape = editor.getShape(shapeId);
					if (shape) {
						previousShapeStates.set(shapeId, { x: shape.x, y: shape.y });
					}
				}
			}
		},
		{ scope: 'document', source: 'user' }
	);

	// Return cleanup function
	return () => {
		removeListener();
		previousShapeStates.clear();
	};
}

/**
 * Update all bound comment positions
 *
 * Useful for initialization or manual refresh of all comment positions.
 *
 * @param editor - Tldraw editor instance
 */
export function updateAllBoundCommentPositions(editor: Editor): void {
	const allShapes = editor.getCurrentPageShapes();

	for (const shape of allShapes) {
		if (shape.type === 'comment') {
			const comment = shape as TLCommentShape;
			if (comment.props.boundShapeId) {
				updateCommentPositionFromBinding(editor, comment.id);
			}
		}
	}
}

/**
 * Handle comment drag end - check if comment should be unbound or rebound
 *
 * This should be called when a user finishes dragging a comment to check:
 * 1. If the comment is too far from its bound shape (unbind it)
 * 2. If the comment is now over a different shape (rebind to new shape)
 *
 * @param editor - Tldraw editor instance
 * @param commentId - ID of the comment that was dragged
 * @param unbindThreshold - Distance threshold for unbinding (default: 150px)
 */
export function handleCommentDragEnd(
	editor: Editor,
	commentId: TLShapeId,
	unbindThreshold: number = 150
): void {
	const comment = editor.getShape<TLCommentShape>(commentId);

	if (!comment || comment.type !== 'comment') {
		return;
	}

	// If comment is bound, check if it should be unbound
	if (comment.props.boundShapeId) {
		const boundShape = editor.getShape(comment.props.boundShapeId as any);

		if (!boundShape) {
			// Bound shape doesn't exist, unbind
			unbindComment(editor, commentId);
			return;
		}

		// Calculate distance from comment to bound shape
		const commentCenterX = comment.x + comment.props.w / 2;
		const commentCenterY = comment.y + comment.props.h / 2;

		const boundBounds = editor.getShapeGeometry(boundShape).bounds;
		const boundCenterX = boundShape.x + boundBounds.width / 2;
		const boundCenterY = boundShape.y + boundBounds.height / 2;

		const distance = Math.sqrt(
			Math.pow(commentCenterX - boundCenterX, 2) +
				Math.pow(commentCenterY - boundCenterY, 2)
		);

		// If too far, unbind
		if (distance > unbindThreshold) {
			unbindComment(editor, commentId);
		}
	}
}
