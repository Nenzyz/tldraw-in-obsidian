/**
 * CommentConnectorLine
 *
 * Renders a visual connector line from a comment to its bound shape.
 * The line is only shown when the comment is selected or hovered.
 */

import * as React from 'react';
import { Editor, TLShapeId, useEditor, useValue } from 'tldraw';
import { TLCommentShape } from './CommentShape';

interface CommentConnectorLineProps {
	commentId: TLShapeId;
}

/**
 * Component that renders a dotted connector line from a comment to its bound shape
 */
export function CommentConnectorLine({ commentId }: CommentConnectorLineProps) {
	const editor = useEditor();

	// Get comment shape
	const comment = useValue(
		'comment',
		() => {
			const shape = editor.getShape<TLCommentShape>(commentId);
			return shape && shape.type === 'comment' ? shape : null;
		},
		[editor, commentId]
	);

	// Get bound shape
	const boundShape = useValue(
		'boundShape',
		() => {
			if (!comment?.props.boundShapeId) return null;
			const shape = editor.getShape(comment.props.boundShapeId as any);
			return shape || null;
		},
		[editor, comment]
	);

	// Check if comment is selected or hovered
	const isSelected = useValue(
		'isSelected',
		() => editor.getSelectedShapeIds().includes(commentId),
		[editor, commentId]
	);

	const isHovered = useValue(
		'isHovered',
		() => editor.getHoveredShapeId() === commentId,
		[editor, commentId]
	);

	// Only show connector if comment is bound, selected or hovered
	if (!comment || !boundShape || (!isSelected && !isHovered)) {
		return null;
	}

	// Calculate connector line endpoints
	const { startPoint, endPoint } = calculateConnectorPoints(
		editor,
		comment,
		boundShape
	);

	if (!startPoint || !endPoint) {
		return null;
	}

	return (
		<svg
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				zIndex: 1000,
			}}
		>
			<line
				x1={startPoint.x}
				y1={startPoint.y}
				x2={endPoint.x}
				y2={endPoint.y}
				stroke="#4A9EFF"
				strokeWidth="1.5"
				strokeDasharray="4 4"
				opacity="0.6"
				strokeLinecap="round"
			/>
			{/* Small circle at the connection point on bound shape */}
			<circle
				cx={endPoint.x}
				cy={endPoint.y}
				r="3"
				fill="#4A9EFF"
				opacity="0.8"
			/>
		</svg>
	);
}

/**
 * Calculate the start and end points for the connector line
 *
 * Start point: Center of comment shape
 * End point: Nearest edge/center of bound shape
 */
function calculateConnectorPoints(
	editor: Editor,
	comment: TLCommentShape,
	boundShape: any
): { startPoint: { x: number; y: number }; endPoint: { x: number; y: number } } | { startPoint: null; endPoint: null } {
	// Comment center point
	const commentCenterX = comment.x + comment.props.w / 2;
	const commentCenterY = comment.y + comment.props.h / 2;

	// Get bound shape bounds
	const boundBounds = editor.getShapeGeometry(boundShape).bounds;
	const boundLeft = boundShape.x;
	const boundTop = boundShape.y;
	const boundRight = boundShape.x + boundBounds.width;
	const boundBottom = boundShape.y + boundBounds.height;
	const boundCenterX = boundShape.x + boundBounds.width / 2;
	const boundCenterY = boundShape.y + boundBounds.height / 2;

	// Find nearest point on bound shape's edge
	let endX = boundCenterX;
	let endY = boundCenterY;

	// Calculate which edge is closest
	const dx = commentCenterX - boundCenterX;
	const dy = commentCenterY - boundCenterY;

	const angle = Math.atan2(dy, dx);
	const absAngle = Math.abs(angle);

	// Determine which edge to connect to based on angle
	if (absAngle < Math.PI / 4) {
		// Right edge
		endX = boundRight;
		endY = boundCenterY;
	} else if (absAngle > (3 * Math.PI) / 4) {
		// Left edge
		endX = boundLeft;
		endY = boundCenterY;
	} else if (angle > 0) {
		// Bottom edge
		endX = boundCenterX;
		endY = boundBottom;
	} else {
		// Top edge
		endX = boundCenterX;
		endY = boundTop;
	}

	return {
		startPoint: { x: commentCenterX, y: commentCenterY },
		endPoint: { x: endX, y: endY },
	};
}
