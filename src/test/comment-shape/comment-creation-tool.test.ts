/**
 * Tests for Comment Creation Tool (Task Group 3)
 *
 * Tests cover:
 * - Tool activation and state transitions (idle → pointing → complete)
 * - Comment creation on empty canvas (free-floating)
 * - Comment creation over shape (bound comment)
 * - Hover detection and binding target highlight
 * - Tool returning to select mode after placement
 * - User author attribution on created comments
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTLStore, Editor, TLShape, defaultShapeUtils, defaultBindingUtils } from 'tldraw';
import { CommentShapeUtil, TLCommentShape } from '../../tldraw/shapes/comment';
import { CommentTool } from '../../tldraw/tools/comment-tool';

describe('Comment Creation Tool', () => {
	let editor: Editor;
	let testUser: string;

	beforeEach(() => {
		testUser = 'TestUser123';

		// Create a store with CommentShapeUtil and default shape utils registered
		const store = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
		});

		// Create editor instance
		editor = new Editor({
			store,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			getContainer: () => document.createElement('div'),
			tools: [CommentTool],
		});

		// Mock user context - in real implementation this would come from plugin settings
		// For now, we'll store it on the editor instance for testing
		(editor as any)._testCurrentUser = testUser;
	});

	it('should activate comment tool and enter idle state', () => {
		// Activate the comment tool
		editor.setCurrentTool('comment');

		// Tool should be active
		expect(editor.getCurrentToolId()).toBe('comment');

		// Should be in idle state initially
		const toolPath = editor.getPath();
		expect(toolPath).toContain('comment.idle');
	});

	it('should transition from idle to pointing on pointer down', () => {
		editor.setCurrentTool('comment');

		// Simulate pointer down
		editor.pointerDown(100, 100, { target: 'canvas', shape: undefined });

		// Should transition to pointing state
		const toolPath = editor.getPath();
		expect(toolPath).toContain('comment.pointing');
	});

	it('should create free-floating comment on empty canvas click', () => {
		editor.setCurrentTool('comment');

		const clickX = 150;
		const clickY = 200;

		// Simulate click on empty canvas (pointer down + up)
		editor.pointerDown(clickX, clickY, { target: 'canvas', shape: undefined });
		editor.pointerUp(clickX, clickY, { target: 'canvas', shape: undefined });

		// Should have created a comment shape
		const shapes = editor.getCurrentPageShapes();
		const comments = shapes.filter((s) => s.type === 'comment') as TLCommentShape[];

		expect(comments.length).toBe(1);

		const comment = comments[0];
		expect(comment.x).toBeCloseTo(clickX, 1);
		expect(comment.y).toBeCloseTo(clickY, 1);
		expect(comment.props.author).toBe(testUser);
		expect(comment.props.status).toBe('open');
		expect(comment.props.replies).toEqual([]);
		expect(comment.props.boundShapeId).toBeUndefined();
		expect(comment.props.offset).toBeUndefined();
	});

	it('should create bound comment when clicking over a shape', () => {
		// First, create a target shape to click on
		const targetShapeId = editor.createShape({
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 100, h: 100 },
		});

		editor.setCurrentTool('comment');

		// Click on the shape (center of the shape)
		const clickX = 150;
		const clickY = 150;

		// Simulate pointer down on shape
		const targetShape = editor.getShape(targetShapeId);
		editor.pointerDown(clickX, clickY, { target: 'shape', shape: targetShape });
		editor.pointerUp(clickX, clickY, { target: 'shape', shape: targetShape });

		// Should have created a bound comment
		const shapes = editor.getCurrentPageShapes();
		const comments = shapes.filter((s) => s.type === 'comment') as TLCommentShape[];

		expect(comments.length).toBe(1);

		const comment = comments[0];
		expect(comment.props.boundShapeId).toBe(targetShapeId);
		expect(comment.props.offset).toBeDefined();
		expect(comment.props.offset!.x).toBeCloseTo(clickX - targetShape!.x, 1);
		expect(comment.props.offset!.y).toBeCloseTo(clickY - targetShape!.y, 1);
	});

	it('should detect hovering over shape during placement', () => {
		// Create a target shape
		const targetShapeId = editor.createShape({
			type: 'geo',
			x: 200,
			y: 200,
			props: { w: 100, h: 100 },
		});

		editor.setCurrentTool('comment');

		// Pointer down on empty canvas
		editor.pointerDown(50, 50, { target: 'canvas', shape: undefined });

		// Move pointer over the shape
		const targetShape = editor.getShape(targetShapeId);
		editor.pointerMove(250, 250, { target: 'shape', shape: targetShape });

		// Tool should be in pointing state and tracking the hover target
		const toolPath = editor.getPath();
		expect(toolPath).toContain('comment.pointing');

		// The tool should track that we're hovering over a shape
		// This is internal state that would be used for visual feedback
		const tool = editor.getStateDescendant('comment.pointing');
		expect(tool).toBeDefined();

		// When we release, should bind to the hovered shape
		editor.pointerUp(250, 250, { target: 'shape', shape: targetShape });

		const comments = editor.getCurrentPageShapes().filter((s) => s.type === 'comment') as TLCommentShape[];
		expect(comments.length).toBe(1);
		expect(comments[0].props.boundShapeId).toBe(targetShapeId);
	});

	it('should return to select mode after comment placement', () => {
		editor.setCurrentTool('comment');

		// Create a comment by clicking
		editor.pointerDown(100, 100, { target: 'canvas', shape: undefined });
		editor.pointerUp(100, 100, { target: 'canvas', shape: undefined });

		// Should have transitioned back to select tool
		expect(editor.getCurrentToolId()).toBe('select');
	});

	it('should properly attribute comments to current user', () => {
		const customUser = 'AnotherUser456';
		(editor as any)._testCurrentUser = customUser;

		editor.setCurrentTool('comment');

		// Create multiple comments
		editor.pointerDown(50, 50, { target: 'canvas', shape: undefined });
		editor.pointerUp(50, 50, { target: 'canvas', shape: undefined });

		editor.setCurrentTool('comment');
		editor.pointerDown(150, 150, { target: 'canvas', shape: undefined });
		editor.pointerUp(150, 150, { target: 'canvas', shape: undefined });

		const comments = editor.getCurrentPageShapes().filter((s) => s.type === 'comment') as TLCommentShape[];

		expect(comments.length).toBe(2);
		comments.forEach((comment) => {
			expect(comment.props.author).toBe(customUser);
			expect(comment.props.createdAt).toBeDefined();
			expect(comment.props.createdAt).toBeGreaterThan(0);
		});
	});

	it('should initialize comments with correct timestamps', () => {
		const beforeCreate = Date.now();

		editor.setCurrentTool('comment');
		editor.pointerDown(100, 100, { target: 'canvas', shape: undefined });
		editor.pointerUp(100, 100, { target: 'canvas', shape: undefined });

		const afterCreate = Date.now();

		const comments = editor.getCurrentPageShapes().filter((s) => s.type === 'comment') as TLCommentShape[];
		const comment = comments[0];

		expect(comment.props.createdAt).toBeGreaterThanOrEqual(beforeCreate);
		expect(comment.props.createdAt).toBeLessThanOrEqual(afterCreate);
		expect(comment.props.lastModified).toBe(comment.props.createdAt);
	});
});
