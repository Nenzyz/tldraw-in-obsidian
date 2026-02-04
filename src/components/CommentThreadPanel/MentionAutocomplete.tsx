import React, { useState, useEffect, useMemo, useCallback, KeyboardEvent } from 'react';
import { useEditor, TLShapeId } from 'tldraw';
import type { Mention, TLCommentShape } from '../../tldraw/shapes/comment/CommentShape';

export interface MentionAutocompleteProps {
	query: string;
	onSelect: (mention: Mention) => void;
	onClose: () => void;
}

// Robot icon for AI
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

// User icon
const UserIcon = () => (
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
		<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
		<circle cx="12" cy="7" r="4"></circle>
	</svg>
);

// Map tldraw color names to actual CSS colors
const TLDRAW_COLORS: Record<string, string> = {
	'black': '#1d1d1d',
	'grey': '#adb5bd',
	'light-violet': '#e599f7',
	'violet': '#ae3ec9',
	'blue': '#4dabf7',
	'light-blue': '#4dc9f6',
	'yellow': '#ffd43b',
	'orange': '#ff922b',
	'green': '#66d9e8',
	'light-green': '#63e6be',
	'light-red': '#ff8787',
	'red': '#e03131',
	'pink': '#e64980',
};

// Shape icon by type - miniature versions
const getShapeIcon = (shapeType: string, color: string) => {
	const iconColor = TLDRAW_COLORS[color] || '#1d1d1d';
	
	switch (shapeType) {
		case 'text':
			return (
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
					<path d="M4 7V4h16v3M9 20h6M12 4v16"/>
				</svg>
			);
		case 'note':
			return (
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
					<path d="M14 3v4a1 1 0 0 0 1 1h4"/>
					<path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
				</svg>
			);
		case 'geo':
			return (
				<svg width="16" height="16" viewBox="0 0 24 24" fill={iconColor} stroke={iconColor} strokeWidth="1.5">
					<rect x="4" y="4" width="16" height="16" rx="2"/>
				</svg>
			);
		case 'draw':
			return (
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
					<path d="M12 19l7-7 3 3-7 7-3-3z"/>
					<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
				</svg>
			);
		case 'arrow':
			return (
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
					<path d="M5 12h14M12 5l7 7-7 7"/>
				</svg>
			);
		case 'line':
			return (
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
					<line x1="5" y1="19" x2="19" y2="5"/>
				</svg>
			);
		case 'frame':
			return (
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
					<rect x="2" y="2" width="20" height="20" rx="2"/>
				</svg>
			);
		case 'image':
			return (
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
					<rect x="3" y="3" width="18" height="18" rx="2"/>
					<circle cx="9" cy="9" r="2"/>
					<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
				</svg>
			);
		default:
			return (
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
					<rect x="3" y="3" width="18" height="18" rx="2"/>
				</svg>
			);
	}
};

interface MentionOption {
	mention: Mention;
	group: 'shapes' | 'users' | 'ai';
	color?: string; // Shape color for visual indication
	shapeType?: string; // Shape type for icon rendering
}

export function MentionAutocomplete({ query, onSelect, onClose }: MentionAutocompleteProps) {
	const editor = useEditor();
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Get all available mention options
	const allOptions = useMemo(() => {
		const options: MentionOption[] = [];

		// Get all shapes on canvas
		const shapes = editor.getCurrentPageShapes();
		for (const shape of shapes) {
			// Skip comment shapes
			if (shape.type === 'comment') continue;

			// Extract text content from shape using tldraw's official API
			let textContent = '';
			try {
				// Use getShapeUtil().getText() - the correct tldraw v4 way
				const shapeUtil = editor.getShapeUtil(shape);
				textContent = shapeUtil.getText(shape) || '';
			} catch (e) {
				// Fallback if getShapeUtil fails
				const props = shape.props as any;
				if (props.text) {
					textContent = typeof props.text === 'string' ? props.text : props.text.text || '';
				}
			}

			// Clean and truncate text content for display
			let displayText = textContent.trim();
			
			// Remove newlines and extra whitespace
			displayText = displayText.replace(/\s+/g, ' ');
			
			if (displayText.length > 60) {
				displayText = displayText.substring(0, 60) + '...';
			}

			// Use text content as display name, fallback to shape type if no text
			const displayName = displayText || `${shape.type.charAt(0).toUpperCase()}${shape.type.slice(1)} shape`;

			// Get shape color
			const props = shape.props as any;
			const color = props.color || 'black';

			options.push({
				mention: {
					type: 'shape',
					id: shape.id,
					displayName: displayName,
				},
				group: 'shapes',
				color,
				shapeType: shape.type,
			});
		}

		// Get unique comment authors (users)
		const commentShapes = shapes.filter(s => s.type === 'comment') as TLCommentShape[];
		const uniqueAuthors = new Set<string>();

		commentShapes.forEach(comment => {
			uniqueAuthors.add(comment.props.author);
			comment.props.replies.forEach(reply => {
				if (reply.author !== 'AI') {
					uniqueAuthors.add(reply.author);
				}
			});
		});

		// Add user mentions
		Array.from(uniqueAuthors).forEach(author => {
			options.push({
				mention: {
					type: 'user',
					id: author,
					displayName: author,
				},
				group: 'users',
			});
		});

		// Add AI mention
		options.push({
			mention: {
				type: 'agent',
				id: 'AI',
				displayName: 'AI',
			},
			group: 'ai',
		});

		return options;
	}, [editor]);

	// Filter options based on query
	const filteredOptions = useMemo(() => {
		if (!query) return allOptions;

		const lowerQuery = query.toLowerCase();
		return allOptions.filter(option =>
			option.mention.displayName.toLowerCase().includes(lowerQuery) ||
			option.mention.id.toLowerCase().includes(lowerQuery)
		);
	}, [allOptions, query]);

	// Group filtered options
	const groupedOptions = useMemo(() => {
		const groups = {
			ai: filteredOptions.filter(o => o.group === 'ai'),
			users: filteredOptions.filter(o => o.group === 'users'),
			shapes: filteredOptions.filter(o => o.group === 'shapes'),
		};
		return groups;
	}, [filteredOptions]);

	// Flatten grouped options for keyboard navigation
	const flatOptions = useMemo(() => {
		return [
			...groupedOptions.ai,
			...groupedOptions.users,
			...groupedOptions.shapes,
		];
	}, [groupedOptions]);

	// Reset selected index when options change
	useEffect(() => {
		setSelectedIndex(0);
	}, [filteredOptions]);

	// Handle keyboard navigation
	const handleKeyDown = useCallback((event: KeyboardEvent) => {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				setSelectedIndex(prev => Math.min(prev + 1, flatOptions.length - 1));
				break;
			case 'ArrowUp':
				event.preventDefault();
				setSelectedIndex(prev => Math.max(prev - 1, 0));
				break;
			case 'Enter':
				event.preventDefault();
				if (flatOptions[selectedIndex]) {
					onSelect(flatOptions[selectedIndex].mention);
				}
				break;
			case 'Escape':
				event.preventDefault();
				onClose();
				break;
		}
	}, [flatOptions, selectedIndex, onSelect, onClose]);

	// Attach keyboard listener
	useEffect(() => {
		const listener = (e: any) => handleKeyDown(e);
		window.addEventListener('keydown', listener);
		return () => window.removeEventListener('keydown', listener);
	}, [handleKeyDown]);

	if (flatOptions.length === 0) {
		return (
			<div className="ptl-mention-autocomplete">
				<div className="ptl-mention-autocomplete-empty">No matches found</div>
			</div>
		);
	}

	return (
		<div className="ptl-mention-autocomplete">
			{/* AI Group */}
			{groupedOptions.ai.length > 0 && (
				<div className="ptl-mention-group">
					<div className="ptl-mention-group-header">AI</div>
					{groupedOptions.ai.map((option, groupIndex) => {
						const globalIndex = groupIndex;
						return (
							<button
								key={option.mention.id}
								className={'ptl-mention-option ' + (selectedIndex === globalIndex ? 'selected' : '')}
								onClick={() => onSelect(option.mention)}
								onMouseEnter={() => setSelectedIndex(globalIndex)}
							>
								<RobotIcon />
								<span className="ptl-mention-option-name">{option.mention.displayName}</span>
							</button>
						);
					})}
				</div>
			)}

			{/* Users Group */}
			{groupedOptions.users.length > 0 && (
				<div className="ptl-mention-group">
					<div className="ptl-mention-group-header">Users</div>
					{groupedOptions.users.map((option, groupIndex) => {
						const globalIndex = groupedOptions.ai.length + groupIndex;
						return (
							<button
								key={option.mention.id}
								className={'ptl-mention-option ' + (selectedIndex === globalIndex ? 'selected' : '')}
								onClick={() => onSelect(option.mention)}
								onMouseEnter={() => setSelectedIndex(globalIndex)}
							>
								<UserIcon />
								<span className="ptl-mention-option-name">{option.mention.displayName}</span>
							</button>
						);
					})}
				</div>
			)}

			{/* Shapes Group */}
			{groupedOptions.shapes.length > 0 && (
				<div className="ptl-mention-group">
					<div className="ptl-mention-group-header">Shapes</div>
					{groupedOptions.shapes.slice(0, 10).map((option, groupIndex) => {
						const globalIndex = groupedOptions.ai.length + groupedOptions.users.length + groupIndex;
						const isPlaceholder = option.mention.displayName.endsWith(' shape');
						return (
							<button
								key={option.mention.id}
								className={'ptl-mention-option ' + (selectedIndex === globalIndex ? 'selected' : '')}
								onClick={() => onSelect(option.mention)}
								onMouseEnter={() => setSelectedIndex(globalIndex)}
							>
								{getShapeIcon(option.shapeType || 'geo', option.color || 'black')}
								<span className={`ptl-mention-option-name ${isPlaceholder ? 'ptl-mention-placeholder' : ''}`}>
									{option.mention.displayName}
								</span>
							</button>
						);
					})}
					{groupedOptions.shapes.length > 10 && (
						<div className="ptl-mention-group-footer">
							{groupedOptions.shapes.length - 10} more shapes...
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default MentionAutocomplete;
