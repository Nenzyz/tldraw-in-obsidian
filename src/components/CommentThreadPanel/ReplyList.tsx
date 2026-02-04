import React, { useCallback, useState } from 'react';
import { useEditor, TLShapeId } from 'tldraw';
import type { Reply, Mention } from '../../tldraw/shapes/comment/CommentShape';
import { deleteReply, editReply } from '../../tldraw/shapes/comment/utils/comment-helpers';

export interface ReplyListProps {
	replies: Reply[];
	currentUser?: string;
	commentId: TLShapeId;
}

// Robot icon for AI replies
const RobotIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<rect x="3" y="11" width="18" height="10" rx="2"></rect>
		<circle cx="12" cy="5" r="2"></circle>
		<path d="M12 7v4"></path>
		<line x1="8" y1="16" x2="8" y2="16"></line>
		<line x1="16" y1="16" x2="16" y2="16"></line>
	</svg>
);

// Edit icon
const EditIcon = () => (
	<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
		<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
	</svg>
);

// Trash icon
const TrashIcon = () => (
	<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<polyline points="3 6 5 6 21 6"></polyline>
		<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
	</svg>
);

// Check icon for save
const CheckIcon = () => (
	<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<polyline points="20 6 9 17 4 12"></polyline>
	</svg>
);

// X icon for cancel
const XIcon = () => (
	<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
		<line x1="18" y1="6" x2="6" y2="18"></line>
		<line x1="6" y1="6" x2="18" y2="18"></line>
	</svg>
);

export function ReplyList({ replies, currentUser, commentId }: ReplyListProps) {
	if (replies.length === 0) {
		return (
			<div className="ptl-reply-list-empty">
				No replies yet. Start the conversation!
			</div>
		);
	}

	// Sort replies by timestamp (chronological order)
	const sortedReplies = [...replies].sort((a, b) => a.timestamp - b.timestamp);

	return (
		<div className="ptl-reply-list">
			{sortedReplies.map((reply) => (
				<ReplyItem
					key={reply.id}
					reply={reply}
					isCurrentUser={reply.author === currentUser}
					commentId={commentId}
				/>
			))}
		</div>
	);
}

interface ReplyItemProps {
	reply: Reply;
	isCurrentUser: boolean;
	commentId: TLShapeId;
}

function ReplyItem({ reply, isCurrentUser, commentId }: ReplyItemProps) {
	const editor = useEditor();
	const isAI = reply.author === 'AI';
	const [isEditing, setIsEditing] = useState(false);
	const [editedMessage, setEditedMessage] = useState(reply.message);

	// Format timestamp for display
	const formatTime = (timestamp: number) => {
		const date = new Date(timestamp);
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();

		if (isToday) {
			return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} else {
			return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' +
				date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		}
	};

	// Handle clicking on a shape mention (center view without zooming)
	const handleShapeMentionClick = useCallback((shapeId: string) => {
		const shape = editor.getShape(shapeId as TLShapeId);
		if (shape) {
			// Get shape's page bounds to find its center
			const pageBounds = editor.getShapePageBounds(shape);
			if (pageBounds) {
				// Center camera on the shape without changing zoom
				const centerX = pageBounds.x + pageBounds.w / 2;
				const centerY = pageBounds.y + pageBounds.h / 2;
				editor.centerOnPoint({ x: centerX, y: centerY });
			}
			// Select the shape
			editor.select(shapeId as TLShapeId);
		}
	}, [editor]);

	// Handle delete reply
	const handleDelete = useCallback(() => {
		if (confirm('Delete this reply?')) {
			deleteReply(editor, commentId, reply.id);
		}
	}, [editor, commentId, reply.id]);

	// Handle save edit
	const handleSaveEdit = useCallback(() => {
		if (editedMessage.trim()) {
			editReply(editor, commentId, reply.id, editedMessage);
			setIsEditing(false);
		}
	}, [editor, commentId, reply.id, editedMessage]);

	// Handle cancel edit
	const handleCancelEdit = useCallback(() => {
		setEditedMessage(reply.message);
		setIsEditing(false);
	}, [reply.message]);

	// Render message with inline mentions
	const renderMessage = () => {
		const { message, mentions } = reply;

		// If no mentions, just return the message
		if (mentions.length === 0) {
			return <span className="ptl-reply-message-text">{message}</span>;
		}

		// Split message by @ symbol and reconstruct with styled mentions
		const parts: React.ReactNode[] = [];
		let lastIndex = 0;

		// Find all @ positions in the message
		const mentionPattern = /@(\S+)/g;
		let match;

		while ((match = mentionPattern.exec(message)) !== null) {
			const mentionText = match[0]; // @Something
			const mentionName = match[1]; // Something
			const mentionIndex = match.index;

			// Add text before this mention
			if (mentionIndex > lastIndex) {
				parts.push(message.substring(lastIndex, mentionIndex));
			}

			// Find the matching mention data
			const mentionData = mentions.find(m =>
				m.displayName === mentionName || m.id === mentionName
			);

			if (mentionData) {
				// Render styled mention based on type
				switch (mentionData.type) {
					case 'shape':
						parts.push(
							<button
								key={'mention-' + mentionIndex}
								className="ptl-reply-mention ptl-reply-mention-shape"
								onClick={() => handleShapeMentionClick(mentionData.id)}
								title={'Go to ' + mentionData.displayName}
							>
								{mentionText}
							</button>
						);
						break;
					case 'user':
						parts.push(
							<span
								key={'mention-' + mentionIndex}
								className="ptl-reply-mention ptl-reply-mention-user"
								title={'User: ' + mentionData.displayName}
							>
								{mentionText}
							</span>
						);
						break;
					case 'agent':
						parts.push(
							<span
								key={'mention-' + mentionIndex}
								className="ptl-reply-mention ptl-reply-mention-agent"
								title="AI Assistant"
							>
								<RobotIcon />
								{mentionText}
							</span>
						);
						break;
				}
			} else {
				// No matching mention data, render as plain text
				parts.push(mentionText);
			}

			lastIndex = mentionIndex + mentionText.length;
		}

		// Add any remaining text
		if (lastIndex < message.length) {
			parts.push(message.substring(lastIndex));
		}

		return <span className="ptl-reply-message-text">{parts}</span>;
	};

	return (
		<div className={'ptl-reply-item ' + (isCurrentUser ? 'current-user' : '') + ' ' + (isAI ? 'ai-reply' : '')}>
			<div className="ptl-reply-header">
				<div className="ptl-reply-author">
					{isAI && <RobotIcon />}
					<strong>{reply.author}</strong>
				</div>
				<div className="ptl-reply-actions">
					{isEditing ? (
						<>
							<button
								className="ptl-reply-action-btn ptl-reply-save-btn"
								onClick={handleSaveEdit}
								title="Save"
							>
								<CheckIcon />
							</button>
							<button
								className="ptl-reply-action-btn ptl-reply-cancel-btn"
								onClick={handleCancelEdit}
								title="Cancel"
							>
								<XIcon />
							</button>
						</>
					) : (
						<>
							{isCurrentUser && !isAI && (
								<>
									<button
										className="ptl-reply-action-btn ptl-reply-edit-btn"
										onClick={() => setIsEditing(true)}
										title="Edit"
									>
										<EditIcon />
									</button>
									<button
										className="ptl-reply-action-btn ptl-reply-delete-btn"
										onClick={handleDelete}
										title="Delete"
									>
										<TrashIcon />
									</button>
								</>
							)}
							<div className="ptl-reply-timestamp">{formatTime(reply.timestamp)}</div>
						</>
					)}
				</div>
			</div>
			<div className="ptl-reply-message">
				{isEditing ? (
					<textarea
						className="ptl-reply-edit-textarea"
						value={editedMessage}
						onChange={(e) => setEditedMessage(e.target.value)}
						autoFocus
						onKeyDown={(e) => {
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
								handleSaveEdit();
							} else if (e.key === 'Escape') {
								handleCancelEdit();
							}
						}}
					/>
				) : (
					renderMessage()
				)}
			</div>
		</div>
	);
}
