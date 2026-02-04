import React, { useCallback } from 'react';
import { useEditor, TLShapeId } from 'tldraw';
import type { TLCommentShape } from '../../tldraw/shapes/comment/CommentShape';
import { capitalize } from 'src/utils/string';

interface CommentListProps {
	comments: TLCommentShape[];
}

// Comment status indicator icon
const StatusIndicator = ({ status }: { status: 'open' | 'resolved' }) => {
	if (status === 'resolved') {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="ptl-comment-status-resolved"
			>
				<polyline points="20 6 9 17 4 12"></polyline>
			</svg>
		);
	}
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="ptl-comment-status-open"
		>
			<circle cx="12" cy="12" r="10"></circle>
		</svg>
	);
};

// Link/binding indicator icon
const BindingIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="12"
		height="12"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className="ptl-comment-binding-icon"
	>
		<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
		<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
	</svg>
);

function CommentItem({ comment }: { comment: TLCommentShape }) {
	const editor = useEditor();

	// Get the first line of text from the first reply (if any)
	const previewText = comment.props.replies.length > 0 ? comment.props.replies[0].message : 'No replies yet';
	const firstLine = previewText.split('\n')[0].slice(0, 50) + (previewText.length > 50 ? '...' : '');

	// Get bound shape info if comment is bound
	const boundShape = comment.props.boundShapeId
		? editor.getShape(comment.props.boundShapeId as TLShapeId)
		: null;
	const boundShapeName = boundShape
		? (boundShape.meta.name as string) || capitalize(boundShape.type) + ' shape'
		: null;

	// Handle click to center view on comment (without zooming)
	const handleClick = useCallback(() => {
		// Get comment's page bounds to find its center
		const pageBounds = editor.getShapePageBounds(comment);
		if (pageBounds) {
			// Center camera on the comment without changing zoom
			const centerX = pageBounds.x + pageBounds.w / 2;
			const centerY = pageBounds.y + pageBounds.h / 2;
			editor.centerOnPoint({ x: centerX, y: centerY });
		}
		// Select the comment
		editor.select(comment.id);
	}, [editor, comment]);

	return (
		<div className="ptl-comment-item" onClick={handleClick}>
			<div className="ptl-comment-item-header">
				<StatusIndicator status={comment.props.status} />
				<span className="ptl-comment-author">{comment.props.author}</span>
				{comment.props.replies.length > 0 && (
					<span className="ptl-comment-reply-count">({comment.props.replies.length})</span>
				)}
			</div>
			<div className="ptl-comment-preview">{firstLine}</div>
			{boundShapeName && (
				<div className="ptl-comment-binding">
					<BindingIcon />
					<span className="ptl-comment-binding-text">{boundShapeName}</span>
				</div>
			)}
		</div>
	);
}

export function CommentList({ comments }: CommentListProps) {
	// Sort comments: unresolved first, then by lastModified timestamp within each group
	const sortedComments = [...comments].sort((a, b) => {
		// First, sort by status (open before resolved)
		if (a.props.status === 'open' && b.props.status === 'resolved') {
			return -1;
		}
		if (a.props.status === 'resolved' && b.props.status === 'open') {
			return 1;
		}
		// Within same status, sort by most recent first
		return b.props.lastModified - a.props.lastModified;
	});

	return (
		<div className="ptl-comment-list">
			{sortedComments.map((comment) => (
				<CommentItem key={comment.id} comment={comment} />
			))}
		</div>
	);
}
