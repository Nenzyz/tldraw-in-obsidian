import * as React from 'react';
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	ShapeUtil,
	resizeBox,
	Editor,
	TLShape,
	TLShapeUtilCanBindOpts,
	TLResizeInfo,
} from 'tldraw';
import { commentShapeProps, TLCommentShape } from './CommentShape';

/**
 * CommentShapeUtil - Utility class for comment shapes
 *
 * Handles rendering, default props, and shape behavior for comment shapes.
 * Comments render as speech bubble icons on the canvas.
 */
export class CommentShapeUtil extends BaseBoxShapeUtil<TLCommentShape> {
	static override type = 'comment' as const;
	static override props = commentShapeProps;

	override isAspectRatioLocked = (_shape: TLCommentShape) => true;
	override canResize = (_shape: TLCommentShape) => false;
	override canBind = (_opts: TLShapeUtilCanBindOpts<TLCommentShape>) => true;

	getDefaultProps(): TLCommentShape['props'] {
		return {
			author: '',
			createdAt: Date.now(),
			lastModified: Date.now(),
			status: 'open',
			replies: [],
			w: 32,
			h: 32,
			color: 'black',
		};
	}

	component(shape: TLCommentShape) {
		return <CommentShapeComponent shape={shape} />;
	}

	indicator(shape: TLCommentShape) {
		return <rect width={shape.props.w} height={shape.props.h} />;
	}

	override onResize = (shape: TLCommentShape, info: TLResizeInfo<TLCommentShape>) => {
		return resizeBox(shape, info);
	};
}

/**
 * CommentShapeComponent - React component for rendering comment shapes on canvas
 *
 * Features:
 * - Renders speech bubble icon (SVG)
 * - Shows reply count badge in top-right corner
 * - Visual styling for resolved state (gray/translucent)
 * - Scale-independent rendering at all zoom levels
 * - Hover state with preview tooltip
 */
function CommentShapeComponent({ shape }: { shape: TLCommentShape }) {
	const { props } = shape;
	const isResolved = props.status === 'resolved';
	const replyCount = props.replies.length;
	const opacity = isResolved ? 0.4 : 1;

	// Format timestamp for tooltip
	const createdDate = new Date(props.createdAt).toLocaleDateString();
	const boundShapeInfo = props.boundShapeId ? ` • Bound to ${props.boundShapeId}` : '';

	return (
		<HTMLContainer
			style={{
				width: props.w,
				height: props.h,
				position: 'relative',
				pointerEvents: 'all',
			}}
		>
			<div
				className="ptl-comment-shape-container"
				style={{
					width: '100%',
					height: '100%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					position: 'relative',
					opacity,
					transition: 'filter 0.2s ease, transform 0.2s ease',
				}}
				title={`${props.author} • ${createdDate} • ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}${boundShapeInfo}`}
			>
				{/* Speech bubble SVG icon - matches toolbar icon from lucide message-circle */}
				<svg
					width="100%"
					height="100%"
					viewBox="0 0 24 24"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					style={{
						filter: isResolved ? 'grayscale(100%)' : 'none',
						transition: 'filter 0.2s ease',
					}}
				>
					<path
						d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						fill={isResolved ? '#999' : '#4A9EFF'}
					/>
				</svg>

				{/* Reply count badge */}
				{replyCount > 0 && (
					<div
						style={{
							position: 'absolute',
							top: '-4px',
							right: '-4px',
							backgroundColor: isResolved ? '#666' : '#FF4444',
							color: 'white',
							borderRadius: '50%',
							width: '16px',
							height: '16px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: '10px',
							fontWeight: 'bold',
							border: '2px solid white',
						}}
					>
						{replyCount > 9 ? '9+' : replyCount}
					</div>
				)}

				{/* Resolved checkmark overlay */}
				{isResolved && (
					<div
						style={{
							position: 'absolute',
							bottom: '-2px',
							right: '-2px',
							backgroundColor: '#4CAF50',
							borderRadius: '50%',
							width: '12px',
							height: '12px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							border: '1px solid white',
						}}
					>
						<svg
							width="8"
							height="8"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M20 6L9 17l-5-5"
								stroke="white"
								strokeWidth="3"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</div>
				)}
			</div>
		</HTMLContainer>
	);
}
