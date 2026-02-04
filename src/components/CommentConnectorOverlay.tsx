/**
 * CommentConnectorOverlay
 *
 * Renders visual connector lines from comments to their bound shapes.
 * Lines are only shown when comments are selected or hovered.
 */

import * as React from 'react';
import { useEditor, useValue, TLShapeId } from 'tldraw';
import { TLCommentShape } from '../tldraw/shapes/comment/CommentShape';

/**
 * Overlay component that renders connector lines for all bound comments
 */
export default function CommentConnectorOverlay() {
	const editor = useEditor();

	// Get all comment shapes
	const comments = useValue(
		'comment shapes',
		() => {
			const allShapes = editor.getCurrentPageShapes();
			return allShapes.filter(
				(shape) => shape.type === 'comment'
			) as TLCommentShape[];
		},
		[editor]
	);

	// Get selected and hovered shape IDs
	const selectedIds = useValue(
		'selected shape ids',
		() => editor.getSelectedShapeIds(),
		[editor]
	);

	const hoveredId = useValue('hovered shape id', () => editor.getHoveredShapeId(), [editor]);

	// Filter comments that should show connectors
	const commentsWithConnectors = React.useMemo(() => {
		return comments.filter((comment) => {
			// Must have a binding
			if (!comment.props.boundShapeId) return false;

			// Must be selected or hovered
			const isSelected = selectedIds.includes(comment.id);
			const isHovered = hoveredId === comment.id;

			return isSelected || isHovered;
		});
	}, [comments, selectedIds, hoveredId]);

	if (commentsWithConnectors.length === 0) {
		return null;
	}

	return (
		<svg className="tl-overlays__item" aria-hidden="true">
			{commentsWithConnectors.map((comment) => (
				<CommentConnectorLine key={comment.id} comment={comment} editor={editor} />
			))}
		</svg>
	);
}

/**
 * Individual connector line for a single comment
 */
function CommentConnectorLine({
	comment,
	editor,
}: {
	comment: TLCommentShape;
	editor: any;
}) {
	// Get bound shape
	const boundShape = editor.getShape(comment.props.boundShapeId);

	if (!boundShape) {
		return null;
	}

	// Calculate connector line endpoints
	const { startPoint, endPoint } = calculateConnectorPoints(editor, comment, boundShape);

	if (!startPoint || !endPoint) {
		return null;
	}

	// Get zoom level for scaling
	const zoom = editor.getZoomLevel();
	const strokeWidth = 1.5 / zoom;
	const dashSize = 4 / zoom;
	const circleRadius = 3 / zoom;

	return (
		<g>
			{/* Connector line */}
			<line
				x1={startPoint.x}
				y1={startPoint.y}
				x2={endPoint.x}
				y2={endPoint.y}
				stroke="#4A9EFF"
				strokeWidth={strokeWidth}
				strokeDasharray={`${dashSize} ${dashSize}`}
				opacity="0.6"
				strokeLinecap="round"
			/>
			{/* Small circle at the connection point on bound shape */}
			<circle
				cx={endPoint.x}
				cy={endPoint.y}
				r={circleRadius}
				fill="#4A9EFF"
				opacity="0.8"
			/>
		</g>
	);
}

/**
 * Calculate the start and end points for the connector line
 *
 * Start point: Center of comment shape
 * End point: Nearest edge/center of bound shape
 */
function calculateConnectorPoints(
	editor: any,
	comment: TLCommentShape,
	boundShape: any
): {
	startPoint: { x: number; y: number } | null;
	endPoint: { x: number; y: number } | null;
} {
	try {
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
	} catch (error) {
		console.error('Error calculating connector points:', error);
		return { startPoint: null, endPoint: null };
	}
}
