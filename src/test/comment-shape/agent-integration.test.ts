import { describe, it, expect, beforeEach } from 'vitest';
import { createTLStore, Editor, defaultShapeUtils, defaultBindingUtils, createShapeId, TLShapeId } from 'tldraw';
import { CommentShapeUtil } from 'src/tldraw/shapes/comment/CommentShapeUtil';
import { TldrawAgent } from 'src/ai/agent/TldrawAgent';
import type { TLCommentShape, Reply } from 'src/tldraw/shapes/comment/CommentShape';
import { createComment, getCommentReplies } from 'src/tldraw/shapes/comment/utils/comment-helpers';
import { AISettings } from 'src/ai/agent/streamAgent';

/**
 * Test suite for AI Agent Comment Integration (Task Group 6)
 *
 * Tests verify:
 * - Agent can create free-floating comments
 * - Agent can create bound comments (attached to shape)
 * - Agent can add replies to existing comments
 * - @AI mention detection in replies
 * - Agent responding to @AI mentions
 * - Agent author attribution ("AI" in comments/replies)
 */

describe('Task Group 6: AI Agent Comment Integration', () => {
	let editor: Editor;
	let agent: TldrawAgent;

	beforeEach(() => {
		// Create editor with comment shape support
		const store = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
		});

		editor = new Editor({
			store,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			getContainer: () => document.createElement('div'),
			tools: [],
		});

		// Create mock agent with minimal setup
		const mockSettings: AISettings = {
			provider: 'anthropic',
			model: 'claude-sonnet-4',
			apiKeys: {
				anthropic: 'test-key',
			},
		};

		agent = new TldrawAgent({
			editor,
			id: 'test-agent',
			onError: (e) => console.error('Agent error:', e),
			getSettings: () => mockSettings,
		});
	});

	/**
	 * Test 1: Agent creates free-floating comment
	 */
	it('should allow agent to create free-floating comment', () => {
		// Agent creates comment at position
		const commentId = agent.createComment(
			{ x: 100, y: 200 },
			'This is an AI-generated comment'
		);

		// Verify comment exists
		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment).toBeDefined();
		expect(comment?.type).toBe('comment');

		// Verify author is "AI"
		expect(comment?.props.author).toBe('AI');

		// Verify position
		expect(comment?.x).toBe(100);
		expect(comment?.y).toBe(200);

		// Verify it's free-floating (no binding)
		expect(comment?.props.boundShapeId).toBeUndefined();
		expect(comment?.props.offset).toBeUndefined();

		// Verify initial state
		expect(comment?.props.status).toBe('open');
		expect(comment?.props.replies.length).toBe(1); // Initial reply from AI
		expect(comment?.props.replies[0].message).toBe('This is an AI-generated comment');
	});

	/**
	 * Test 2: Agent creates bound comment (attached to shape)
	 */
	it('should allow agent to create bound comment attached to shape', () => {
		// Create a target shape
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 300,
			y: 400,
			props: {
				w: 100,
				h: 100,
				geo: 'rectangle',
			},
		});

		// Agent creates comment bound to target shape
		const commentId = agent.createComment(
			{ x: 350, y: 350 },
			'This shape needs improvement',
			targetShapeId
		);

		// Verify comment exists
		const comment = editor.getShape<TLCommentShape>(commentId);
		expect(comment).toBeDefined();
		expect(comment?.props.author).toBe('AI');

		// Verify binding
		expect(comment?.props.boundShapeId).toBe(targetShapeId);
		expect(comment?.props.offset).toBeDefined();
		expect(comment?.props.offset?.x).toBe(50);
		expect(comment?.props.offset?.y).toBe(-50);
	});

	/**
	 * Test 3: Agent adds reply to existing comment
	 */
	it('should allow agent to add reply to existing comment', () => {
		// User creates a comment
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User');

		// Add a user reply
		const userReply: Reply = {
			id: 'reply-1',
			author: 'User',
			message: 'This is a user reply',
			timestamp: Date.now(),
			mentions: [],
		};
		const comment = editor.getShape<TLCommentShape>(commentId);
		editor.updateShape<TLCommentShape>({
			id: commentId,
			type: 'comment',
			props: {
				...comment!.props,
				replies: [userReply],
			},
		});

		// Agent adds reply
		agent.addCommentReply(commentId, 'I can help with that!');

		// Verify reply was added
		const replies = getCommentReplies(editor, commentId);
		expect(replies.length).toBe(2);

		// Verify AI reply attributes
		const aiReply = replies[1];
		expect(aiReply.author).toBe('AI');
		expect(aiReply.message).toBe('I can help with that!');
		expect(aiReply.timestamp).toBeGreaterThan(0);
		expect(aiReply.mentions).toEqual([]);
	});

	/**
	 * Test 4: Detect @AI mentions in comment replies
	 */
	it('should detect @AI mentions in comment replies', () => {
		// Create comment with reply mentioning @AI
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User');

		const replyWithMention: Reply = {
			id: 'reply-1',
			author: 'User',
			message: 'Hey @AI can you help with this?',
			timestamp: Date.now(),
			mentions: [
				{
					type: 'agent',
					id: 'AI',
					displayName: 'AI',
				},
			],
		};

		const comment = editor.getShape<TLCommentShape>(commentId);
		editor.updateShape<TLCommentShape>({
			id: commentId,
			type: 'comment',
			props: {
				...comment!.props,
				replies: [replyWithMention],
			},
		});

		// Get mentions from comment
		const mentions = agent.getMentionsInComment(commentId);

		// Verify @AI mention was detected
		expect(mentions.length).toBe(1);
		expect(mentions[0].type).toBe('agent');
		expect(mentions[0].id).toBe('AI');
		expect(mentions[0].displayName).toBe('AI');
	});

	/**
	 * Test 5: Agent responds to @AI mention
	 */
	it('should allow agent to respond to @AI mention', () => {
		// Create comment with @AI mention
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User');

		const replyWithMention: Reply = {
			id: 'reply-1',
			author: 'User',
			message: '@AI what do you think about this design?',
			timestamp: Date.now(),
			mentions: [
				{
					type: 'agent',
					id: 'AI',
					displayName: 'AI',
				},
			],
		};

		const comment = editor.getShape<TLCommentShape>(commentId);
		editor.updateShape<TLCommentShape>({
			id: commentId,
			type: 'comment',
			props: {
				...comment!.props,
				replies: [replyWithMention],
			},
		});

		// Agent responds to mention
		agent.respondToMention(commentId, 'reply-1', 'The design looks good! Consider adding more contrast.');

		// Verify response was added
		const replies = getCommentReplies(editor, commentId);
		expect(replies.length).toBe(2);

		const aiResponse = replies[1];
		expect(aiResponse.author).toBe('AI');
		expect(aiResponse.message).toBe('The design looks good! Consider adding more contrast.');
	});

	/**
	 * Test 6: Agent author attribution in comments
	 */
	it('should attribute comments to "AI" author', () => {
		// Agent creates multiple comments
		const comment1Id = agent.createComment({ x: 100, y: 100 }, 'First comment');
		const comment2Id = agent.createComment({ x: 200, y: 200 }, 'Second comment');

		// Verify all comments have "AI" as author
		const comment1 = editor.getShape<TLCommentShape>(comment1Id);
		const comment2 = editor.getShape<TLCommentShape>(comment2Id);

		expect(comment1?.props.author).toBe('AI');
		expect(comment2?.props.author).toBe('AI');
	});

	/**
	 * Test 7: Agent reply includes @mentions
	 */
	it('should allow agent to include @mentions in replies', () => {
		// Create a comment and a shape
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User');
		const shapeId = createShapeId();
		editor.createShape({
			id: shapeId,
			type: 'geo',
			x: 200,
			y: 200,
			props: {
				w: 100,
				h: 100,
				geo: 'rectangle',
			},
		});

		// Agent adds reply with shape mention
		const shapeMention = {
			type: 'shape' as const,
			id: shapeId,
			displayName: `geo-${shapeId.substring(0, 8)}`,
		};

		agent.addCommentReply(
			commentId,
			`Check out this shape: @${shapeMention.displayName}`,
			[shapeMention]
		);

		// Verify reply includes mention
		const replies = getCommentReplies(editor, commentId);
		expect(replies.length).toBe(1);

		const aiReply = replies[0];
		expect(aiReply.author).toBe('AI');
		expect(aiReply.mentions.length).toBe(1);
		expect(aiReply.mentions[0].type).toBe('shape');
		expect(aiReply.mentions[0].id).toBe(shapeId);
	});

	/**
	 * Test 8: Get all comments with @AI mentions
	 */
	it('should get all comments with @AI mentions', () => {
		// Create multiple comments
		const comment1Id = createComment(editor, { x: 100, y: 100 }, 'User');
		const comment2Id = createComment(editor, { x: 200, y: 200 }, 'User');
		const comment3Id = createComment(editor, { x: 300, y: 300 }, 'User');

		// Add replies with and without @AI mentions
		const replyWithMention: Reply = {
			id: 'reply-1',
			author: 'User',
			message: '@AI help please',
			timestamp: Date.now(),
			mentions: [{ type: 'agent', id: 'AI', displayName: 'AI' }],
		};

		const replyWithoutMention: Reply = {
			id: 'reply-2',
			author: 'User',
			message: 'Just a regular reply',
			timestamp: Date.now(),
			mentions: [],
		};

		// Comment 1: has @AI mention
		let comment = editor.getShape<TLCommentShape>(comment1Id);
		editor.updateShape<TLCommentShape>({
			id: comment1Id,
			type: 'comment',
			props: { ...comment!.props, replies: [replyWithMention] },
		});

		// Comment 2: no mention
		comment = editor.getShape<TLCommentShape>(comment2Id);
		editor.updateShape<TLCommentShape>({
			id: comment2Id,
			type: 'comment',
			props: { ...comment!.props, replies: [replyWithoutMention] },
		});

		// Comment 3: has @AI mention
		comment = editor.getShape<TLCommentShape>(comment3Id);
		editor.updateShape<TLCommentShape>({
			id: comment3Id,
			type: 'comment',
			props: { ...comment!.props, replies: [replyWithMention] },
		});

		// Get all comments with @AI mentions
		const mentionedComments = agent.getCommentsWithAIMentions();

		// Verify correct comments returned
		expect(mentionedComments.length).toBe(2);
		expect(mentionedComments.some(c => c.id === comment1Id)).toBe(true);
		expect(mentionedComments.some(c => c.id === comment3Id)).toBe(true);
		expect(mentionedComments.some(c => c.id === comment2Id)).toBe(false);
	});
});
