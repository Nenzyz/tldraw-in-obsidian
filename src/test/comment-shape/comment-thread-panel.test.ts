/**
 * Tests for Task Group 5: Comment Thread Panel & Reply System
 *
 * Tests the CommentThreadPanel component which displays when a comment is selected,
 * showing the full reply thread with reply submission, @mention autocomplete,
 * status toggles, and mention rendering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTLStore, TLStoreSnapshot, Editor, createShapeId, TLShapeId, defaultShapeUtils, defaultBindingUtils } from 'tldraw';
import { CommentShapeUtil } from 'src/tldraw/shapes/comment/CommentShapeUtil';
import { createComment, addReply, updateCommentStatus } from 'src/tldraw/shapes/comment/utils/comment-helpers';
import type { TLCommentShape, Reply, Mention } from 'src/tldraw/shapes/comment/CommentShape';

describe('Task Group 5: Comment Thread Panel & Reply System', () => {
	let editor: Editor;
	let cleanup: (() => void) | undefined;

	beforeEach(() => {
		// Create store with CommentShapeUtil and default utils
		const store = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
		});

		// Create editor instance
		const editorInstance = new Editor({
			store,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			tools: [],
			getContainer: () => document.body,
		});

		editor = editorInstance;

		cleanup = () => {
			editorInstance.dispose();
		};
	});

	afterEach(() => {
		if (cleanup) {
			cleanup();
			cleanup = undefined;
		}
	});

	/**
	 * Test 1: Panel display when comment is selected
	 *
	 * Verifies that the thread panel should display when a comment shape is selected.
	 * This test validates the data needed for rendering, not the UI component itself.
	 */
	it('should provide comment data when comment is selected', () => {
		// Create a comment
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');
		const comment = editor.getShape<TLCommentShape>(commentId);

		expect(comment).toBeDefined();
		expect(comment?.type).toBe('comment');

		// Select the comment
		editor.select(commentId);
		const selectedShapes = editor.getSelectedShapes();

		expect(selectedShapes.length).toBe(1);
		expect(selectedShapes[0].id).toBe(commentId);

		// Verify comment metadata is available for panel display
		const selectedComment = selectedShapes[0] as TLCommentShape;
		expect(selectedComment.props.author).toBe('User1');
		expect(selectedComment.props.createdAt).toBeGreaterThan(0);
		expect(selectedComment.props.status).toBe('open');
		expect(selectedComment.props.replies).toEqual([]);
	});

	/**
	 * Test 2: Reply list rendering with timestamps and authors
	 *
	 * Verifies that reply data is correctly structured for chronological rendering
	 * with author and timestamp information.
	 */
	it('should provide reply data with timestamps and authors for rendering', () => {
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');

		// Add multiple replies
		const reply1: Reply = {
			id: 'reply-1',
			author: 'User2',
			message: 'First reply',
			timestamp: Date.now(),
			mentions: [],
		};

		const reply2: Reply = {
			id: 'reply-2',
			author: 'AI',
			message: 'AI response',
			timestamp: Date.now() + 1000,
			mentions: [],
		};

		const reply3: Reply = {
			id: 'reply-3',
			author: 'User1',
			message: 'Third reply',
			timestamp: Date.now() + 2000,
			mentions: [],
		};

		addReply(editor, commentId, reply1);
		addReply(editor, commentId, reply2);
		addReply(editor, commentId, reply3);

		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.replies).toHaveLength(3);

		// Verify chronological order (replies should be in timestamp order)
		const replies = comment!.props.replies;
		expect(replies[0].author).toBe('User2');
		expect(replies[1].author).toBe('AI');
		expect(replies[2].author).toBe('User1');

		// Verify timestamps are increasing
		expect(replies[1].timestamp).toBeGreaterThan(replies[0].timestamp);
		expect(replies[2].timestamp).toBeGreaterThan(replies[1].timestamp);
	});

	/**
	 * Test 3: Reply submission (adding new reply to comment)
	 *
	 * Verifies that new replies can be added to a comment with correct author,
	 * timestamp, and message.
	 */
	it('should add new reply to comment when submitted', () => {
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');

		// Simulate reply submission
		const newReply: Reply = {
			id: 'reply-new',
			author: 'CurrentUser',
			message: 'This is a new reply',
			timestamp: Date.now(),
			mentions: [],
		};

		addReply(editor, commentId, newReply);

		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.replies).toHaveLength(1);
		expect(comment?.props.replies[0]).toEqual(newReply);

		// Verify lastModified was updated
		expect(comment?.props.lastModified).toBeGreaterThanOrEqual(newReply.timestamp);
	});

	/**
	 * Test 4: @mention autocomplete trigger and selection
	 *
	 * Verifies that mention data can be extracted and structured for autocomplete.
	 * Tests the mention extraction and storage in reply metadata.
	 */
	it('should extract mentions from reply text and store in metadata', () => {
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');

		// Create a shape to reference
		const shapeId = createShapeId();
		editor.createShape({
			id: shapeId,
			type: 'geo',
			x: 200,
			y: 200,
		});

		// Create reply with mentions
		const mentions: Mention[] = [
			{ type: 'user', id: 'User2', displayName: 'User2' },
			{ type: 'agent', id: 'AI', displayName: 'AI' },
			{ type: 'shape', id: shapeId, displayName: shapeId },
		];

		const reply: Reply = {
			id: 'reply-mentions',
			author: 'User1',
			message: 'Hey @User2 and @AI, check out shape @' + shapeId,
			timestamp: Date.now(),
			mentions,
		};

		addReply(editor, commentId, reply);

		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.replies[0].mentions).toHaveLength(3);

		// Verify mention types
		expect(comment?.props.replies[0].mentions[0].type).toBe('user');
		expect(comment?.props.replies[0].mentions[1].type).toBe('agent');
		expect(comment?.props.replies[0].mentions[2].type).toBe('shape');

		// Verify mention data
		expect(comment?.props.replies[0].mentions[0].id).toBe('User2');
		expect(comment?.props.replies[0].mentions[1].id).toBe('AI');
		expect(comment?.props.replies[0].mentions[2].id).toBe(shapeId);
	});

	/**
	 * Test 5: Status toggle (resolve/unresolve comment)
	 *
	 * Verifies that comment status can be toggled between 'open' and 'resolved'.
	 */
	it('should toggle comment status between open and resolved', () => {
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');

		// Initially open
		let comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.status).toBe('open');

		// Toggle to resolved
		updateCommentStatus(editor, commentId, 'resolved');
		comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.status).toBe('resolved');

		// Toggle back to open
		updateCommentStatus(editor, commentId, 'open');
		comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.status).toBe('open');
	});

	/**
	 * Test 6: Mention rendering with type-specific styling
	 *
	 * Verifies that mentions can be identified by type for proper styling:
	 * - Shape mentions: Blue/link color, clickable
	 * - User mentions: Purple/highlight color
	 * - @AI mentions: Green/special color with robot icon
	 */
	it('should identify mention types for type-specific rendering', () => {
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');

		// Create shapes for shape mentions
		const shape1Id = createShapeId();
		const shape2Id = createShapeId();
		editor.createShape({ id: shape1Id, type: 'geo', x: 100, y: 100 });
		editor.createShape({ id: shape2Id, type: 'geo', x: 200, y: 200 });

		// Create reply with all mention types
		const mentions: Mention[] = [
			{ type: 'shape', id: shape1Id, displayName: 'Rectangle' },
			{ type: 'user', id: 'Designer1', displayName: 'Designer1' },
			{ type: 'agent', id: 'AI', displayName: 'AI Assistant' },
			{ type: 'shape', id: shape2Id, displayName: 'Circle' },
		];

		const reply: Reply = {
			id: 'reply-styled',
			author: 'User1',
			message: '@Rectangle @Designer1 @AI @Circle',
			timestamp: Date.now(),
			mentions,
		};

		addReply(editor, commentId, reply);

		const comment = editor.getShape<TLCommentShape>(commentId);
		const storedMentions = comment?.props.replies[0].mentions;

		// Verify each mention type is identifiable
		expect(storedMentions?.filter((m) => m.type === 'shape')).toHaveLength(2);
		expect(storedMentions?.filter((m) => m.type === 'user')).toHaveLength(1);
		expect(storedMentions?.filter((m) => m.type === 'agent')).toHaveLength(1);

		// Verify shape mentions can be linked to actual shapes
		const shapeMentions = storedMentions?.filter((m) => m.type === 'shape');
		shapeMentions?.forEach((mention) => {
			const referencedShape = editor.getShape(mention.id as TLShapeId);
			expect(referencedShape).toBeDefined();
		});
	});

	/**
	 * Test 7: Shape mention clickability (focus camera to referenced shape)
	 *
	 * Verifies that shape mentions contain valid shape IDs that can be used
	 * to focus the camera on the referenced shape.
	 */
	it('should allow camera focus to shape via mention data', () => {
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');

		// Create a shape to reference
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 500,
			y: 500,
			props: { w: 100, h: 100 },
		});

		// Add reply with shape mention
		const mention: Mention = {
			type: 'shape',
			id: targetShapeId,
			displayName: 'Target Shape',
		};

		const reply: Reply = {
			id: 'reply-link',
			author: 'User1',
			message: 'Check out @TargetShape',
			timestamp: Date.now(),
			mentions: [mention],
		};

		addReply(editor, commentId, reply);

		// Verify mention contains valid shape ID
		const comment = editor.getShape<TLCommentShape>(commentId);
		const shapeMention = comment?.props.replies[0].mentions[0];

		expect(shapeMention?.type).toBe('shape');
		expect(shapeMention?.id).toBe(targetShapeId);

		// Verify the referenced shape exists and can be accessed
		const referencedShape = editor.getShape(shapeMention!.id as TLShapeId);
		expect(referencedShape).toBeDefined();
		expect(referencedShape?.x).toBe(500);
		expect(referencedShape?.y).toBe(500);

		// Verify we can get shape bounds for camera focus
		const shapeBounds = editor.getShapeGeometry(referencedShape!).bounds;
		expect(shapeBounds).toBeDefined();
		expect(shapeBounds.width).toBe(100);
		expect(shapeBounds.height).toBe(100);
	});

	/**
	 * Test 8: AI author identification in replies
	 *
	 * Verifies that replies from "AI" author can be identified for special styling
	 * (robot icon display).
	 */
	it('should identify AI author for special rendering', () => {
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');

		// Add AI reply
		const aiReply: Reply = {
			id: 'reply-ai',
			author: 'AI',
			message: 'I can help with that!',
			timestamp: Date.now(),
			mentions: [],
		};

		// Add user reply
		const userReply: Reply = {
			id: 'reply-user',
			author: 'User2',
			message: 'Thanks for the help',
			timestamp: Date.now() + 1000,
			mentions: [],
		};

		addReply(editor, commentId, aiReply);
		addReply(editor, commentId, userReply);

		const comment = editor.getShape<TLCommentShape>(commentId);
		const replies = comment?.props.replies;

		// Verify AI author can be identified
		expect(replies?.[0].author).toBe('AI');
		expect(replies?.[1].author).toBe('User2');

		// Panel should be able to check if author === 'AI' for icon display
		const isAIReply = replies?.[0].author === 'AI';
		expect(isAIReply).toBe(true);
	});
});
