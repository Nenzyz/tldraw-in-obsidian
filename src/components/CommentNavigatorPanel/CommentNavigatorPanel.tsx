import React, { useState, useCallback, useMemo } from 'react';
import { useEditor, useValue } from 'tldraw';
import { CommentList } from './CommentList';
import type { TLCommentShape } from '../../tldraw/shapes/comment/CommentShape';

export interface CommentNavigatorPanelProps {
	/** Whether the panel starts in a collapsed state */
	defaultCollapsed?: boolean;
	/** Callback when panel open state changes */
	onOpenChange?: (isOpen: boolean) => void;
	/** Whether to force the panel open (controlled mode) */
	isOpen?: boolean;
}

// Speech bubble icon for comments
const CommentIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
	</svg>
);

// Eye icon for visibility toggle
const EyeIcon = () => (
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
		<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
		<circle cx="12" cy="12" r="3"></circle>
	</svg>
);

// Eye off icon for hidden state
const EyeOffIcon = () => (
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
		<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
		<line x1="1" y1="1" x2="23" y2="23"></line>
	</svg>
);

// Check icon (resolved comments shown)
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

// Check icon with strikethrough (resolved comments hidden)
const CheckStrikeIcon = () => (
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
		<line x1="3" y1="3" x2="21" y2="21"></line>
	</svg>
);

export function CommentNavigatorPanel({
	defaultCollapsed = false,
	onOpenChange,
	isOpen: controlledIsOpen,
}: CommentNavigatorPanelProps) {
	const editor = useEditor();
	const [internalIsOpen, setInternalIsOpen] = useState(!defaultCollapsed);

	// Filter states
	const [showResolved, setShowResolved] = useState(false);
	const [hideAllComments, setHideAllComments] = useState(false);
	const [searchText, setSearchText] = useState('');
	const [filterAuthor, setFilterAuthor] = useState<string | null>(null);
	const [filterBinding, setFilterBinding] = useState<'all' | 'bound' | 'unbound'>('all');

	// Use controlled or uncontrolled mode
	const isPanelOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

	const handleTogglePanel = useCallback(() => {
		const newState = !isPanelOpen;
		if (controlledIsOpen === undefined) {
			setInternalIsOpen(newState);
		}
		onOpenChange?.(newState);
	}, [isPanelOpen, controlledIsOpen, onOpenChange]);

	// Get all comment shapes from the canvas
	const allComments = useValue(
		'comments',
		() => {
			const shapes = editor.getCurrentPageShapes();
			return shapes.filter((shape) => shape.type === 'comment') as TLCommentShape[];
		},
		[editor]
	);

	// Get unique authors for filter dropdown
	const uniqueAuthors = useMemo(() => {
		const authors = new Set<string>();
		allComments.forEach((comment) => {
			authors.add(comment.props.author);
		});
		return Array.from(authors).sort();
	}, [allComments]);

	// Apply filters to comment list (always show all, but can filter by author/binding/search)
	const filteredComments = useMemo(() => {
		let filtered = [...allComments];

		// Note: We don't filter by resolved status here - the list always shows all comments
		// The showResolved toggle controls canvas visibility, not list filtering

		// Filter by author
		if (filterAuthor) {
			filtered = filtered.filter((comment) => comment.props.author === filterAuthor);
		}

		// Filter by binding status
		if (filterBinding === 'bound') {
			filtered = filtered.filter((comment) => comment.props.boundShapeId !== undefined);
		} else if (filterBinding === 'unbound') {
			filtered = filtered.filter((comment) => comment.props.boundShapeId === undefined);
		}

		// Search by reply content
		if (searchText.trim()) {
			const searchLower = searchText.toLowerCase();
			filtered = filtered.filter((comment) =>
				comment.props.replies.some((reply) => reply.message.toLowerCase().includes(searchLower))
			);
		}

		return filtered;
	}, [allComments, filterAuthor, filterBinding, searchText]);

	// Handle "Hide All Comments" toggle - respects resolved filter state
	const handleHideAllToggle = useCallback(() => {
		const newHideState = !hideAllComments;
		setHideAllComments(newHideState);

		// Update comment shapes to hide/show them
		// If resolved comments are already hidden, only toggle open comments
		allComments.forEach((comment) => {
			// Skip resolved comments if they're filtered out
			if (!showResolved && comment.props.status === 'resolved') {
				return;
			}
			
			editor.updateShape({
				...comment,
				meta: {
					...comment.meta,
					hidden: newHideState,
				},
			});
		});
	}, [hideAllComments, allComments, editor, showResolved]);

	// Handle "Show Resolved" toggle - controls canvas visibility of resolved comments
	const handleShowResolvedToggle = useCallback(() => {
		const newShowState = !showResolved;
		setShowResolved(newShowState);

		// Update resolved comment shapes to hide/show them on canvas
		allComments.forEach((comment) => {
			if (comment.props.status === 'resolved') {
				editor.updateShape({
					...comment,
					meta: {
						...comment.meta,
						hidden: !newShowState,
					},
				});
			}
		});
	}, [showResolved, allComments, editor]);

	return (
		<div className="ptl-comment-navigator-wrapper">
			<button
				className="ptl-comment-navigator-toggle-btn"
				onClick={handleTogglePanel}
				aria-label={isPanelOpen ? 'Hide comment navigator' : 'Show comment navigator'}
				title={isPanelOpen ? 'Hide comments' : 'Show comments'}
			>
				<CommentIcon />
			</button>
			{isPanelOpen && (
				<div className="ptl-comment-navigator">
					<div className="ptl-comment-navigator-header">
						<span className="ptl-comment-navigator-title">Comments</span>
						<div className="ptl-comment-navigator-header-actions">
							<button
								className={`ptl-comment-navigator-header-btn ${hideAllComments ? 'active' : ''}`}
								onClick={handleHideAllToggle}
								aria-label={hideAllComments ? 'Show all comments' : 'Hide all comments'}
								title={hideAllComments ? 'Show all comments' : 'Hide all comments'}
							>
								{hideAllComments ? <EyeOffIcon /> : <EyeIcon />}
							</button>
							<button
								className={`ptl-comment-navigator-header-btn ${!showResolved ? 'active' : ''}`}
								onClick={handleShowResolvedToggle}
								aria-label={showResolved ? 'Hide resolved on canvas' : 'Show resolved on canvas'}
								title={showResolved ? 'Hide resolved on canvas' : 'Show resolved on canvas'}
							>
								{showResolved ? <CheckIcon /> : <CheckStrikeIcon />}
							</button>
						</div>
					</div>
					<div className="ptl-comment-navigator-filters">
						<input
							type="text"
							className="ptl-comment-navigator-search"
							placeholder="Search in replies..."
							value={searchText}
							onChange={(e) => setSearchText(e.target.value)}
						/>
						<div className="ptl-comment-navigator-filter-row">
							<select
								className="ptl-comment-navigator-filter"
								value={filterAuthor || ''}
								onChange={(e) => setFilterAuthor(e.target.value || null)}
							>
								<option value="">All Authors</option>
								{uniqueAuthors.map((author) => (
									<option key={author} value={author}>
										{author}
									</option>
								))}
							</select>
							<select
								className="ptl-comment-navigator-filter"
								value={filterBinding}
								onChange={(e) => setFilterBinding(e.target.value as 'all' | 'bound' | 'unbound')}
							>
								<option value="all">All Comments</option>
								<option value="bound">Bound Only</option>
								<option value="unbound">Unbound Only</option>
							</select>
						</div>
					</div>
					<div className="ptl-comment-navigator-content">
						{filteredComments.length === 0 ? (
							<div className="ptl-comment-navigator-empty">
								{allComments.length === 0 ? 'No comments yet' : 'No comments match filters'}
							</div>
						) : (
							<CommentList comments={filteredComments} />
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export default CommentNavigatorPanel;
