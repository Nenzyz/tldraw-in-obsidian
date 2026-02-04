import React, { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { useEditor, TLShapeId } from 'tldraw';
import { addReply } from '../../tldraw/shapes/comment/utils/comment-helpers';
import type { Reply, Mention, TLCommentShape } from '../../tldraw/shapes/comment/CommentShape';
import { MentionAutocomplete } from './MentionAutocomplete';

export interface ReplyInputProps {
	commentId: TLShapeId;
	currentUser: string;
}

// Send icon SVG
const SendIcon = () => (
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
		<line x1="22" y1="2" x2="11" y2="13"></line>
		<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
	</svg>
);

export function ReplyInput({ commentId, currentUser }: ReplyInputProps) {
	const editor = useEditor();
	const [inputValue, setInputValue] = useState('');
	const [showAutocomplete, setShowAutocomplete] = useState(false);
	const [autocompleteQuery, setAutocompleteQuery] = useState('');
	const [autocompleteCursorPos, setAutocompleteCursorPos] = useState(0);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Track inserted mentions for reply metadata
	const [insertedMentions, setInsertedMentions] = useState<Mention[]>([]);

	// Auto-resize textarea based on content
	const adjustTextareaHeight = useCallback(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			const maxHeight = 120; // Max height before scrolling
			const newHeight = Math.min(textarea.scrollHeight, maxHeight);
			textarea.style.height = newHeight + 'px';
		}
	}, []);

	useEffect(() => {
		adjustTextareaHeight();
	}, [inputValue, adjustTextareaHeight]);

	// Detect @ character and show autocomplete
	const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const value = e.target.value;
		const cursorPos = e.target.selectionStart;

		setInputValue(value);

		// Check if @ was typed at cursor position
		const textBeforeCursor = value.substring(0, cursorPos);
		const lastAtIndex = textBeforeCursor.lastIndexOf('@');

		if (lastAtIndex !== -1) {
			// Check if there's a space after the @ (if so, don't show autocomplete)
			const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
			if (textAfterAt.indexOf(' ') === -1) {
				// Show autocomplete with query after @
				setShowAutocomplete(true);
				setAutocompleteQuery(textAfterAt);
				setAutocompleteCursorPos(lastAtIndex);
			} else {
				setShowAutocomplete(false);
			}
		} else {
			setShowAutocomplete(false);
		}
	}, []);

	// Handle mention selection from autocomplete
	const handleMentionSelect = useCallback((mention: Mention) => {
		const textBeforeAt = inputValue.substring(0, autocompleteCursorPos);
		const textAfterQuery = inputValue.substring(textareaRef.current?.selectionStart || inputValue.length);

		// Insert mention
		const mentionText = '@' + mention.displayName;
		const newValue = textBeforeAt + mentionText + ' ' + textAfterQuery;

		setInputValue(newValue);
		setShowAutocomplete(false);
		setAutocompleteQuery('');

		// Add to inserted mentions
		setInsertedMentions(prev => [...prev, mention]);

		// Focus back on textarea
		setTimeout(() => {
			if (textareaRef.current) {
				const newCursorPos = (textBeforeAt + mentionText + ' ').length;
				textareaRef.current.focus();
				textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
			}
		}, 0);
	}, [inputValue, autocompleteCursorPos]);

	// Handle submit
	const handleSubmit = useCallback(() => {
		const trimmedValue = inputValue.trim();
		if (!trimmedValue) return;

		// Create reply object
		const reply: Reply = {
			id: 'reply-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
			author: currentUser,
			message: trimmedValue,
			timestamp: Date.now(),
			mentions: insertedMentions,
		};

		// Add reply to comment
		addReply(editor, commentId, reply);

		// Clear input
		setInputValue('');
		setInsertedMentions([]);
	}, [inputValue, currentUser, insertedMentions, editor, commentId]);

	// Handle cancel (clear input)
	const handleCancel = useCallback(() => {
		setInputValue('');
		setInsertedMentions([]);
		setShowAutocomplete(false);
	}, []);

	// Handle keyboard shortcuts
	const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
		// If autocomplete is showing, let it handle keyboard events
		if (showAutocomplete) {
			// Escape closes autocomplete
			if (event.key === 'Escape') {
				setShowAutocomplete(false);
				event.preventDefault();
			}
			return;
		}

		// Enter without shift submits
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSubmit();
		}

		// Escape clears input
		if (event.key === 'Escape') {
			event.preventDefault();
			handleCancel();
		}
	}, [showAutocomplete, handleSubmit, handleCancel]);

	const canSubmit = inputValue.trim().length > 0;

	return (
		<div className="ptl-reply-input-container">
			<div className="ptl-reply-input-header">
				<span className="ptl-reply-input-user">Replying as <strong>{currentUser}</strong></span>
			</div>
			<div className="ptl-reply-input-row">
				<textarea
					ref={textareaRef}
					className="ptl-reply-input-textarea"
					value={inputValue}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					placeholder="Type @ to mention shapes, users, or @AI..."
					rows={1}
					aria-label="Reply message input"
				/>
				<div className="ptl-reply-input-actions">
					{inputValue.trim().length > 0 && (
						<button
							className="ptl-reply-input-btn ptl-reply-cancel-btn"
							onClick={handleCancel}
							aria-label="Cancel"
							title="Cancel (Esc)"
						>
							×
						</button>
					)}
					<button
						className="ptl-reply-input-btn ptl-reply-submit-btn"
						onClick={handleSubmit}
						disabled={!canSubmit}
						aria-label="Send reply"
						title="Send (Enter)"
					>
						<SendIcon />
					</button>
				</div>
			</div>
			{showAutocomplete && (
				<MentionAutocomplete
					query={autocompleteQuery}
					onSelect={handleMentionSelect}
					onClose={() => setShowAutocomplete(false)}
				/>
			)}
		</div>
	);
}

export default ReplyInput;
