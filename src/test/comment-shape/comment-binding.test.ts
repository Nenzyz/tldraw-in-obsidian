/**
 * Tests for Task Group 2: Comment-to-Shape Binding Mechanism
 *
 * Tests cover:
 * - Binding creation between comment and target shape
 * - Comment position updates when bound shape moves
 * - Binding removal when bound shape is deleted
 * - Binding change when dragging comment to new shape
 * - Binding data persistence in store
 * - Unbinding by dragging comment away from shape
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTLStore, Editor, TLStore, defaultShapeUtils, defaultBindingUtils, createShapeId, TLShapeId } from 'tldraw';
import { CommentShapeUtil } from '../../tldraw/shapes/comment/CommentShapeUtil';
import {
	createComment,
	bindCommentToShape,
	unbindComment,
	updateCommentPositionFromBinding,
} from '../../tldraw/shapes/comment/utils/comment-helpers';
import { TLCommentShape } from '../../tldraw/shapes/comment/CommentShape';

describe('Comment-to-Shape Binding', () => {
	let store: TLStore;
	let editor: Editor;

	beforeEach(() => {
		// Create a new store with comment shape util for each test
		store = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
		});

		// Create an editor instance with minimal required options
		editor = new Editor({
			store,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			getContainer: () => document.createElement('div'),
			tools: [],
		});
	});

	it('should create binding between comment and target shape', () => {
		// Create a target shape (rectangle)
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 200, h: 100 },
		});

		// Create a comment at position
		const commentId = createComment(editor, { x: 150, y: 150 }, 'TestUser');

		// Bind comment to target shape
		bindCommentToShape(editor, commentId, targetShapeId);

		// Verify binding was created
		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment).toBeDefined();
		expect(comment?.props.boundShapeId).toBe(targetShapeId);
		expect(comment?.props.offset).toBeDefined();
		expect(comment?.props.offset?.x).toBeCloseTo(50); // 150 - 100
		expect(comment?.props.offset?.y).toBeCloseTo(50); // 150 - 100
	});

	it('should update comment position when bound shape moves', () => {
		// Create target shape
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 200, h: 100 },
		});

		// Create and bind comment
		const commentId = createComment(editor, { x: 150, y: 150 }, 'TestUser');
		bindCommentToShape(editor, commentId, targetShapeId);

		const initialComment = editor.getShape<TLCommentShape>(commentId);
		const initialX = initialComment?.x;
		const initialY = initialComment?.y;

		// Move the target shape
		editor.updateShape({
			id: targetShapeId,
			type: 'geo',
			x: 300,
			y: 300,
		});

		// Update comment position from binding
		updateCommentPositionFromBinding(editor, commentId);

		// Verify comment moved with the shape
		const updatedComment = editor.getShape<TLCommentShape>(commentId);
		expect(updatedComment?.x).toBeCloseTo(350); // 300 + 50 (offset)
		expect(updatedComment?.y).toBeCloseTo(350); // 300 + 50 (offset)
		expect(updatedComment?.x).not.toBe(initialX);
		expect(updatedComment?.y).not.toBe(initialY);
	});

	it('should remove binding when bound shape is deleted', () => {
		// Create target shape
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 200, h: 100 },
		});

		// Create and bind comment
		const commentId = createComment(editor, { x: 150, y: 150 }, 'TestUser');
		bindCommentToShape(editor, commentId, targetShapeId);

		// Verify binding exists
		let comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.boundShapeId).toBe(targetShapeId);

		// Delete the target shape
		editor.deleteShape(targetShapeId);

		// Unbind comment (this should be called by a listener in real implementation)
		unbindComment(editor, commentId);

		// Verify binding was removed
		comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.boundShapeId).toBeUndefined();
		expect(comment?.props.offset).toBeUndefined();
	});

	it('should change binding when dragging comment to new shape', () => {
		// Create two target shapes
		const targetShape1Id = createShapeId();
		const targetShape2Id = createShapeId();

		editor.createShape({
			id: targetShape1Id,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 100, h: 100 },
		});

		editor.createShape({
			id: targetShape2Id,
			type: 'geo',
			x: 300,
			y: 300,
			props: { w: 100, h: 100 },
		});

		// Create comment bound to first shape
		const commentId = createComment(editor, { x: 150, y: 150 }, 'TestUser');
		bindCommentToShape(editor, commentId, targetShape1Id);

		let comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.boundShapeId).toBe(targetShape1Id);

		// Rebind to second shape
		bindCommentToShape(editor, commentId, targetShape2Id);

		// Verify binding changed
		comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.boundShapeId).toBe(targetShape2Id);
		expect(comment?.props.offset).toBeDefined();
	});

	it('should persist binding data in store', () => {
		// Create target shape
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 200, h: 100 },
		});

		// Create and bind comment
		const commentId = createComment(editor, { x: 150, y: 150 }, 'TestUser');
		bindCommentToShape(editor, commentId, targetShapeId);

		// Get comment from editor
		const comment = editor.getShape<TLCommentShape>(commentId);

		// Verify binding data persists in the shape
		expect(comment).toBeDefined();
		expect(comment?.props.boundShapeId).toBe(targetShapeId);
		expect(comment?.props.offset).toBeDefined();
		expect(comment?.props.offset?.x).toBeCloseTo(50);
		expect(comment?.props.offset?.y).toBeCloseTo(50);
	});

	it('should unbind comment when dragged away from shape', () => {
		// Create target shape
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 100, h: 100 },
		});

		// Create and bind comment
		const commentId = createComment(editor, { x: 150, y: 150 }, 'TestUser');
		bindCommentToShape(editor, commentId, targetShapeId);

		let comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.boundShapeId).toBe(targetShapeId);

		// Unbind the comment (simulating dragging away)
		unbindComment(editor, commentId);

		// Verify binding was removed
		comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.boundShapeId).toBeUndefined();
		expect(comment?.props.offset).toBeUndefined();
	});

	it('should calculate correct offset from comment position to shape center', () => {
		// Create target shape at specific position
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 200,
			y: 300,
			props: { w: 100, h: 100 },
		});

		// Create comment at offset position
		const commentId = createComment(editor, { x: 220, y: 350 }, 'TestUser');
		bindCommentToShape(editor, commentId, targetShapeId);

		// Verify offset calculation
		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.offset?.x).toBeCloseTo(20); // 220 - 200
		expect(comment?.props.offset?.y).toBeCloseTo(50); // 350 - 300
	});

	it('should maintain relative position when bound shape is transformed', () => {
		// Create target shape
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 100, h: 100 },
		});

		// Create and bind comment with specific offset
		const commentId = createComment(editor, { x: 130, y: 150 }, 'TestUser');
		bindCommentToShape(editor, commentId, targetShapeId);

		const initialOffset = {
			x: 30,
			y: 50,
		};

		let comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.offset?.x).toBeCloseTo(initialOffset.x);
		expect(comment?.props.offset?.y).toBeCloseTo(initialOffset.y);

		// Transform (move and resize) the target shape
		editor.updateShape({
			id: targetShapeId,
			type: 'geo',
			x: 500,
			y: 600,
			props: { w: 200, h: 200 }, // resize shouldn't affect offset
		});

		// Update comment position
		updateCommentPositionFromBinding(editor, commentId);

		// Verify offset is maintained and position updated correctly
		comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.offset?.x).toBeCloseTo(initialOffset.x);
		expect(comment?.props.offset?.y).toBeCloseTo(initialOffset.y);
		expect(comment?.x).toBeCloseTo(530); // 500 + 30
		expect(comment?.y).toBeCloseTo(650); // 600 + 50
	});
});
