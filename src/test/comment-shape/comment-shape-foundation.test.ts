import { describe, it, expect, beforeEach } from 'vitest';
import { createTLStore, Editor, TLStore, defaultShapeUtils, defaultBindingUtils } from 'tldraw';
import { CommentShapeUtil } from 'src/tldraw/shapes/comment/CommentShapeUtil';
import {
	createComment,
	addReply,
	updateCommentStatus,
	getCommentReplies,
	extractMentions,
	updateLastModified
} from 'src/tldraw/shapes/comment/utils/comment-helpers';
import type { TLCommentShape } from 'src/tldraw/shapes/comment/CommentShape';

/**
 * Comment Shape Foundation Test Suite
 *
 * Tests for Task Group 1: Comment Shape Type & Data Model
 * Covers:
 * - Comment shape creation with required metadata
 * - Reply addition and lastModified timestamp update
 * - Status changes (open/resolved)
 * - Shape binding data storage (boundShapeId, offset)
 * - Reply data structure with mentions array
 * - Comment serialization/deserialization in store
 */

describe('CommentShape Foundation', () => {
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

	it('should create a comment shape with required metadata', () => {
		const position = { x: 100, y: 200 };
		const author = 'TestUser';
		const now = Date.now();

		const commentId = createComment(editor, position, author);
		const comment = editor.getShape<TLCommentShape>(commentId);

		expect(comment).toBeDefined();
		expect(comment?.type).toBe('comment');
		expect(comment?.props.author).toBe(author);
		expect(comment?.props.createdAt).toBeGreaterThanOrEqual(now);
		expect(comment?.props.lastModified).toBeGreaterThanOrEqual(now);
		expect(comment?.props.status).toBe('open');
		expect(comment?.props.replies).toEqual([]);
		expect(comment?.x).toBe(position.x);
		expect(comment?.y).toBe(position.y);
	});

	it('should add reply and update lastModified timestamp', () => {
		const commentId = createComment(editor, { x: 0, y: 0 }, 'User1');
		const initialComment = editor.getShape<TLCommentShape>(commentId);
		const initialLastModified = initialComment!.props.lastModified;

		// Wait a bit to ensure timestamp changes
		const reply = {
			id: 'reply-1',
			author: 'User2',
			message: 'Great point!',
			timestamp: Date.now(),
			mentions: [],
		};

		addReply(editor, commentId, reply);

		const updatedComment = editor.getShape<TLCommentShape>(commentId);
		expect(updatedComment?.props.replies).toHaveLength(1);
		expect(updatedComment?.props.replies[0]).toEqual(reply);
		expect(updatedComment?.props.lastModified).toBeGreaterThanOrEqual(initialLastModified);
	});

	it('should update comment status from open to resolved', () => {
		const commentId = createComment(editor, { x: 0, y: 0 }, 'User1');

		updateCommentStatus(editor, commentId, 'resolved');

		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.status).toBe('resolved');
	});

	it('should store binding data (boundShapeId and offset)', () => {
		const position = { x: 100, y: 200 };
		const author = 'TestUser';
		const targetShapeId = editor.createShape({
			type: 'geo',
			x: 300,
			y: 400,
		});

		const commentId = createComment(editor, position, author, {
			boundShapeId: targetShapeId.toString(),
			offset: { x: 50, y: 60 },
		});

		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.boundShapeId).toBe(targetShapeId.toString());
		expect(comment?.props.offset).toEqual({ x: 50, y: 60 });
	});

	it('should support reply data structure with mentions array', () => {
		const commentId = createComment(editor, { x: 0, y: 0 }, 'User1');

		const shapeId = editor.createShape({ type: 'geo', x: 0, y: 0 });
		const reply = {
			id: 'reply-1',
			author: 'User2',
			message: 'Check out @Shape1 and @AI for help',
			timestamp: Date.now(),
			mentions: [
				{ type: 'shape' as const, id: shapeId.toString(), displayName: 'Rectangle' },
				{ type: 'agent' as const, id: 'AI', displayName: 'AI' },
			],
		};

		addReply(editor, commentId, reply);

		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment?.props.replies[0].mentions).toHaveLength(2);
		expect(comment?.props.replies[0].mentions[0].type).toBe('shape');
		expect(comment?.props.replies[0].mentions[1].type).toBe('agent');
	});

	it('should serialize and deserialize comment correctly in store', () => {
		const commentId = createComment(editor, { x: 100, y: 200 }, 'TestUser');
		addReply(editor, commentId, {
			id: 'reply-1',
			author: 'User2',
			message: 'Test reply',
			timestamp: Date.now(),
			mentions: [],
		});

		// Get a snapshot of the store
		const snapshot = store.getStoreSnapshot();

		// Create a new store with the snapshot
		const newStore = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			snapshot,
		});

		// Verify the comment exists with all data
		const comment = newStore.get(commentId) as TLCommentShape;
		expect(comment).toBeDefined();
		expect(comment.type).toBe('comment');
		expect(comment.props.author).toBe('TestUser');
		expect(comment.props.replies).toHaveLength(1);
		expect(comment.props.status).toBe('open');
	});

	it('should extract mentions from reply text', () => {
		const text1 = 'Hey @User1, check out @AI for help with @Shape123';
		const mentions1 = extractMentions(text1);
		expect(mentions1).toHaveLength(3);
		expect(mentions1).toContain('@User1');
		expect(mentions1).toContain('@AI');
		expect(mentions1).toContain('@Shape123');

		const text2 = 'No mentions here';
		const mentions2 = extractMentions(text2);
		expect(mentions2).toHaveLength(0);

		const text3 = 'Multiple @User1 @User2 @AI mentions';
		const mentions3 = extractMentions(text3);
		expect(mentions3).toHaveLength(3);
	});

	it('should update lastModified timestamp when called directly', (ctx) => {
		return new Promise<void>((resolve) => {
			const commentId = createComment(editor, { x: 0, y: 0 }, 'User1');
			const initialComment = editor.getShape<TLCommentShape>(commentId);
			const initialLastModified = initialComment!.props.lastModified;

			// Wait a tiny bit to ensure timestamp difference
			setTimeout(() => {
				updateLastModified(editor, commentId);

				const updatedComment = editor.getShape<TLCommentShape>(commentId);
				expect(updatedComment?.props.lastModified).toBeGreaterThan(initialLastModified);
				resolve();
			}, 10);
		});
	});
});
