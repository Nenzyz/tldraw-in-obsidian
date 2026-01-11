import React, { useState, useCallback } from 'react';
import { useEditor, useValue } from 'tldraw';
import { ShapeList } from './ShapeList';

export interface LayerPanelProps {
	/** Whether the panel starts in a collapsed state */
	defaultCollapsed?: boolean;
	/** Callback when panel open state changes */
	onOpenChange?: (isOpen: boolean) => void;
	/** Whether to force the panel open (controlled mode) */
	isOpen?: boolean;
}

// Layers icon SVG
const LayersIcon = () => (
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
		<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
		<polyline points="2 17 12 22 22 17"></polyline>
		<polyline points="2 12 12 17 22 12"></polyline>
	</svg>
);

export function LayerPanel({
	defaultCollapsed = false,
	onOpenChange,
	isOpen: controlledIsOpen,
}: LayerPanelProps) {
	const editor = useEditor();
	const [internalIsOpen, setInternalIsOpen] = useState(!defaultCollapsed);

	// Use controlled or uncontrolled mode
	const isPanelOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

	const handleTogglePanel = useCallback(() => {
		const newState = !isPanelOpen;
		if (controlledIsOpen === undefined) {
			setInternalIsOpen(newState);
		}
		onOpenChange?.(newState);
	}, [isPanelOpen, controlledIsOpen, onOpenChange]);

	const shapeIds = useValue(
		'shapeIds',
		() => editor.getSortedChildIdsForParent(editor.getCurrentPageId()),
		[editor]
	);

	return (
		<div className="ptl-layer-panel-wrapper">
			<button
				className="ptl-layer-panel-toggle-btn"
				onClick={handleTogglePanel}
				aria-label={isPanelOpen ? 'Hide layer panel' : 'Show layer panel'}
				title={isPanelOpen ? 'Hide layers' : 'Show layers'}
			>
				<LayersIcon />
			</button>
			{isPanelOpen && (
				<div className="ptl-layer-panel">
					<div className="ptl-layer-panel-header">
						<span className="ptl-layer-panel-title">Layers</span>
					</div>
					<div className="ptl-layer-panel-content">
						<ShapeList shapeIds={shapeIds} depth={0} />
					</div>
				</div>
			)}
		</div>
	);
}

export default LayerPanel;
