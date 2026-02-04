import React, { useState, useCallback, useMemo } from 'react';
import { useEditor, useValue, TLShapeId } from 'tldraw';
import type { TLCommentShape, Reply } from '../../tldraw/shapes/comment/CommentShape';
import { ReplyList } from './ReplyList';
import { ReplyInput } from './ReplyInput';
import { updateCommentStatus, deleteComment, bindCommentToShape, unbindComment } from '../../tldraw/shapes/comment';

export interface CommentThreadPanelProps {
	/** The comment shape to display */
	commentId: TLShapeId;
	/** Callback when panel is closed */
	onClose?: () => void;
	/** Current user name for reply attribution */
	currentUser?: string;
}

// Close icon SVG
const CloseIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<line x1="18" y1="6" x2="6" y2="18"></line>
		<line x1="6" y1="6" x2="18" y2="18"></line>
	</svg>
);

// Check icon for resolved status
const CheckIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<polyline points="20 6 9 17 4 12"></polyline>
	</svg>
);

// Circle icon for open status
const CircleIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<circle cx="12" cy="12" r="10"></circle>
	</svg>
);

// Trash icon for delete
const TrashIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<polyline points="3 6 5 6 21 6"></polyline>
		<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
	</svg>
);

// Link icon for binding
const LinkIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
		<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
	</svg>
);

// Unlink icon (link with slash)
const UnlinkIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
		<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
		<line x1="2" y1="2" x2="22" y2="22"></line>
	</svg>
);

export function CommentThreadPanel({
	commentId,
	onClose,
	currentUser = 'User',
}: CommentThreadPanelProps) {
	const editor = useEditor();
	const [isDragging, setIsDragging] = useState(false);

	// Get the comment shape reactively
	const comment = useValue(
		'comment',
		() => {
			return editor.getShape<TLCommentShape>(commentId);
		},
		[editor, commentId]
	);

	// Handle status toggle
	const handleStatusToggle = useCallback(() => {
		if (!comment) return;

		const newStatus = comment.props.status === 'open' ? 'resolved' : 'open';
		updateCommentStatus(editor, commentId, newStatus);
	}, [editor, commentId, comment]);

	// Handle close button
	const handleClose = useCallback(() => {
		// Deselect the comment
		editor.selectNone();
		onClose?.();
	}, [editor, onClose]);

	// Handle delete button
	const handleDelete = useCallback(() => {
		if (!comment) return;
		
		// Confirm deletion
		if (confirm('Delete this comment and all its replies?')) {
			deleteComment(editor, commentId);
			onClose?.();
		}
	}, [editor, commentId, comment, onClose]);

	// Handle unbind (click when already bound)
	const handleUnbind = useCallback(() => {
		if (!comment) return;
		unbindComment(editor, commentId);
	}, [editor, commentId, comment]);

	// Handle mouse down on link button to start "drag" tracking
	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		if (!comment) return;
		
		// If already bound, this is just a click to unbind
		if (comment.props.boundShapeId) {
			return;
		}

		// Prevent default to avoid text selection
		e.preventDefault();
		setIsDragging(true);
	}, [comment]);

	// Listen for mouse up to complete binding
	React.useEffect(() => {
		if (!isDragging) return;

		const handleMouseUp = (e: MouseEvent) => {
			setIsDragging(false);

			// Get the shape at the mouse position
			const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
			const shapeAtPoint = editor.getShapeAtPoint(point);

			if (shapeAtPoint && shapeAtPoint.type !== 'comment') {
				// Bind comment to the shape
				bindCommentToShape(editor, commentId, shapeAtPoint.id);
			}
		};

		// Listen globally for mouse up
		window.addEventListener('mouseup', handleMouseUp);

		return () => {
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, [isDragging, editor, commentId]);

	// Format timestamp for display
	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	};

	if (!comment) {
		return null;
	}

	const { author, createdAt, status, replies, boundShapeId } = comment.props;

	// Get bound shape info if available
	let boundShapeInfo = '';
	if (boundShapeId) {
		const boundShape = editor.getShape(boundShapeId as TLShapeId);
		if (boundShape) {
			boundShapeInfo = `Attached to ${boundShape.type}`;
		}
	}

	return (
		<div className="ptl-comment-thread-panel" data-ptl-editor-block-blur="true">
			<div className="ptl-comment-thread-header">
				<div className="ptl-comment-thread-header-left">
					<span className="ptl-comment-thread-title">Comment Thread</span>
					<button
						className={`ptl-comment-thread-status-btn ${status === 'resolved' ? 'resolved' : ''}`}
						onClick={handleStatusToggle}
						title={status === 'resolved' ? 'Reopen comment' : 'Resolve comment'}
						aria-label={status === 'resolved' ? 'Reopen comment' : 'Resolve comment'}
					>
						{status === 'resolved' ? <CheckIcon /> : <CircleIcon />}
						<span>{status === 'resolved' ? 'Resolved' : 'Open'}</span>
					</button>
				</div>
				<div style={{ display: 'flex', gap: '4px' }}>
					<button
						className={`ptl-comment-thread-bind-btn ${boundShapeId ? 'bound' : ''} ${isDragging ? 'dragging' : ''}`}
						onClick={boundShapeId ? handleUnbind : undefined}
						onMouseDown={!boundShapeId ? handleMouseDown : undefined}
						aria-label={boundShapeId ? 'Unbind from shape' : 'Drag to shape to bind'}
						title={boundShapeId ? 'Click to unbind from shape' : 'Hold and drag to a shape to bind'}
					>
						{boundShapeId ? <UnlinkIcon /> : <LinkIcon />}
					</button>
					<button
						className="ptl-comment-thread-delete-btn"
						onClick={handleDelete}
						aria-label="Delete comment"
						title="Delete comment"
					>
						<TrashIcon />
					</button>
					<button
						className="ptl-comment-thread-close-btn"
						onClick={handleClose}
						aria-label="Close thread panel"
						title="Close"
					>
						<CloseIcon />
					</button>
				</div>
			</div>

			<div className="ptl-comment-thread-metadata">
				<div className="ptl-comment-thread-author">
					<strong>{author}</strong> started this thread
				</div>
				<div className="ptl-comment-thread-date">{formatDate(createdAt)}</div>
				{boundShapeInfo && (
					<div className="ptl-comment-thread-binding">{boundShapeInfo}</div>
				)}
			</div>

			<div className="ptl-comment-thread-content">
				<ReplyList replies={replies} currentUser={currentUser} commentId={commentId} />
			</div>

			<div className="ptl-comment-thread-input-area">
				<ReplyInput
					commentId={commentId}
					currentUser={currentUser}
				/>
			</div>
		</div>
	);
}

export default CommentThreadPanel;
