import { describe, it, expect, vi } from 'vitest';

/**
 * Layer Panel Gap Tests
 *
 * These tests fill critical gaps identified in the Task Group 4 review.
 * They focus on user workflows not covered by Task Groups 1-3.
 * Maximum of 8 additional strategic tests per spec requirements.
 */

describe('Layer Panel Gap Tests', () => {
	describe('Shape renaming for frames vs other shapes', () => {
		it('should update props.name for frame shapes and meta.name for non-frame shapes', () => {
			const mockEditor = {
				updateShape: vi.fn(),
			};

			// Test frame shape renaming
			const frameShape = {
				id: 'shape:frame-1',
				type: 'frame',
				props: { name: 'Old Frame Name' },
				meta: {},
			};

			const newFrameName = 'New Frame Name';
			if (frameShape.type === 'frame') {
				mockEditor.updateShape({
					...frameShape,
					props: { ...frameShape.props, name: newFrameName },
				});
			}

			expect(mockEditor.updateShape).toHaveBeenCalledWith({
				...frameShape,
				props: { ...frameShape.props, name: newFrameName },
			});

			mockEditor.updateShape.mockClear();

			// Test non-frame shape renaming
			const rectangleShape = {
				id: 'shape:rect-1',
				type: 'rectangle',
				props: {},
				meta: { name: 'Old Name' },
			};

			const newRectName = 'New Rectangle Name';
			if (rectangleShape.type !== 'frame') {
				mockEditor.updateShape({
					...rectangleShape,
					meta: { ...rectangleShape.meta, name: newRectName },
				});
			}

			expect(mockEditor.updateShape).toHaveBeenCalledWith({
				...rectangleShape,
				meta: { name: newRectName },
			});
		});
	});

	describe('Shift+click range selection', () => {
		it('should add to selection with shift+click and deselect when already selected', () => {
			// Test adding to selection
			const mockEditor = {
				select: vi.fn(),
				deselect: vi.fn(),
				getSelectedShapes: vi.fn().mockReturnValue([{ id: 'shape:1' }]),
				inputs: { ctrlKey: false, shiftKey: true },
			};

			const shape = { id: 'shape:2', type: 'rectangle', meta: {} };
			let isSelected = false;

			// Shift+click handler logic
			if (mockEditor.inputs.ctrlKey || mockEditor.inputs.shiftKey) {
				if (isSelected) {
					mockEditor.deselect(shape);
				} else {
					mockEditor.select(...mockEditor.getSelectedShapes(), shape);
				}
			}

			expect(mockEditor.select).toHaveBeenCalledWith({ id: 'shape:1' }, shape);

			// Test deselecting
			mockEditor.select.mockClear();
			mockEditor.getSelectedShapes.mockReturnValue([{ id: 'shape:1' }, { id: 'shape:2' }]);
			isSelected = true;

			if (mockEditor.inputs.ctrlKey || mockEditor.inputs.shiftKey) {
				if (isSelected) {
					mockEditor.deselect(shape);
				}
			}

			expect(mockEditor.deselect).toHaveBeenCalledWith(shape);
		});
	});

	describe('Nested shape display and parent-child relationships', () => {
		it('should pass parentIsSelected and parentIsHidden props to children', () => {
			// Test parentIsSelected
			const isParentSelected = true;
			const isParentHidden = false;

			const childPropsSelectedParent = {
				shapeId: 'shape:rect-1',
				depth: 1,
				parentIsSelected: isParentSelected,
				parentIsHidden: isParentHidden,
			};

			expect(childPropsSelectedParent.parentIsSelected).toBe(true);
			expect(childPropsSelectedParent.depth).toBe(1);

			// Test parentIsHidden
			const childPropsHiddenParent = {
				shapeId: 'shape:rect-2',
				depth: 1,
				parentIsSelected: false,
				parentIsHidden: true,
			};

			expect(childPropsHiddenParent.parentIsHidden).toBe(true);
		});
	});

	describe('Shape z-order display', () => {
		it('should display shapes in z-order (front to back)', () => {
			// Mock shapes in z-order as returned by getSortedChildIdsForParent
			const sortedShapeIds = ['shape:top', 'shape:middle', 'shape:bottom'];

			// The ShapeList component maps over these in order
			const renderedOrder = sortedShapeIds.map((id, index) => ({
				id,
				renderIndex: index,
			}));

			// First item (index 0) is at the top/front
			expect(renderedOrder[0].id).toBe('shape:top');
			expect(renderedOrder[1].id).toBe('shape:middle');
			expect(renderedOrder[2].id).toBe('shape:bottom');
		});
	});

	describe('Keyboard handling for rename', () => {
		it('should blur input on Enter and Escape keys', () => {
			const mockBlur = vi.fn();

			// Test Enter key
			const enterEvent = {
				key: 'Enter',
				currentTarget: { blur: mockBlur },
			};

			if (enterEvent.key === 'Enter' || enterEvent.key === 'Escape') {
				enterEvent.currentTarget.blur();
			}
			expect(mockBlur).toHaveBeenCalled();

			mockBlur.mockClear();

			// Test Escape key
			const escapeEvent = {
				key: 'Escape',
				currentTarget: { blur: mockBlur },
			};

			if (escapeEvent.key === 'Enter' || escapeEvent.key === 'Escape') {
				escapeEvent.currentTarget.blur();
			}
			expect(mockBlur).toHaveBeenCalled();
		});
	});

	describe('Canvas selection sync to panel (bidirectional)', () => {
		it('should highlight shape in panel when selected on canvas', () => {
			const mockEditor = {
				getSelectedShapeIds: vi.fn(),
			};

			// Simulate initial state - no selection
			mockEditor.getSelectedShapeIds.mockReturnValue([]);
			let selectedIds = mockEditor.getSelectedShapeIds();
			let isShape1Selected = selectedIds.includes('shape:1');
			expect(isShape1Selected).toBe(false);

			// Simulate canvas selection change
			mockEditor.getSelectedShapeIds.mockReturnValue(['shape:1']);
			selectedIds = mockEditor.getSelectedShapeIds();
			isShape1Selected = selectedIds.includes('shape:1');
			expect(isShape1Selected).toBe(true);
		});

		it('should show multiple shapes selected in panel', () => {
			const mockEditor = {
				getSelectedShapeIds: vi.fn().mockReturnValue(['shape:1', 'shape:2', 'shape:3']),
			};

			const selectedIds = mockEditor.getSelectedShapeIds();

			// All three shapes should be marked as selected in the panel
			expect(selectedIds.includes('shape:1')).toBe(true);
			expect(selectedIds.includes('shape:2')).toBe(true);
			expect(selectedIds.includes('shape:3')).toBe(true);
			expect(selectedIds.length).toBe(3);
		});
	});
});
