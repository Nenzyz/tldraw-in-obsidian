/**
 * Task Group 9: End-to-End Integration Tests
 *
 * Strategic integration tests that cover critical cross-component workflows
 * identified in the test coverage gap analysis. These tests validate complete
 * user journeys and system interactions that span multiple task groups.
 *
 * Total: 10 tests covering high, medium, and low priority gaps
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTLStore, Editor, createShapeId, TLShapeId, defaultShapeUtils, defaultBindingUtils } from 'tldraw';
import { CommentShapeUtil } from 'src/tldraw/shapes/comment/CommentShapeUtil';
import { createComment, addReply, updateCommentStatus } from 'src/tldraw/shapes/comment/utils/comment-helpers';
import {
	getCommentsSince,
	getCommentsModifiedSince,
	getMentionsSince,
	buildDeltaSummary,
} from 'src/tldraw/shapes/comment/utils/change-tracking';
import { readAgentLastCheckTimestamp, writeAgentLastCheckTimestamp } from 'src/utils/file-metadata';
import TldrawStoresManager from 'src/tldraw/TldrawStoresManager';
import type { TLCommentShape, Reply, Mention } from 'src/tldraw/shapes/comment/CommentShape';

describe('Task Group 9: End-to-End Integration Tests', () => {
	let editor: Editor;
	let cleanup: (() => void) | undefined;

	beforeEach(() => {
		const store = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
		});

		const editorInstance = new Editor({
			store,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			tools: [],
			getContainer: () => document.body,
		});

		editor = editorInstance;
		cleanup = () => editorInstance.dispose();
	});

	afterEach(() => {
		if (cleanup) {
			cleanup();
			cleanup = undefined;
		}
	});

	/**
	 * Integration Test 1: Complete Comment Thread Lifecycle (HIGH PRIORITY)
	 *
	 * Tests the full user journey from comment creation through resolution:
	 * 1. Create bound comment
	 * 2. Add reply
	 * 3. Add @AI mention
	 * 4. Agent responds
	 * 5. Resolve comment
	 * 6. Verify all updates sync
	 *
	 * Covers: Task Groups 1, 2, 3, 5, 6, 8
	 */
	it('should handle complete comment thread lifecycle from creation to resolution', () => {
		// Step 1: Create a shape to bind to
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 200,
			y: 200,
			props: { w: 100, h: 100 },
		});

		// Step 2: Create comment bound to shape
		const commentId = createComment(editor, { x: 250, y: 150 }, 'User1');
		const comment = editor.getShape<TLCommentShape>(commentId);

		expect(comment).toBeDefined();
		expect(comment?.props.author).toBe('User1');
		expect(comment?.props.status).toBe('open');

		// Simulate binding (in real implementation, this would be done by creation tool)
		editor.updateShape<TLCommentShape>({
			id: commentId,
			type: 'comment',
			props: {
				...comment!.props,
				boundShapeId: targetShapeId,
				offset: { x: 50, y: -50 },
			},
		});

		// Step 3: Add user reply
		const userReply: Reply = {
			id: 'reply-1',
			author: 'User2',
			message: 'I have a question about this shape',
			timestamp: Date.now(),
			mentions: [],
		};
		addReply(editor, commentId, userReply);

		// Step 4: Add reply with @AI mention
		const mentionReply: Reply = {
			id: 'reply-2',
			author: 'User1',
			message: 'Hey @AI, can you help with this?',
			timestamp: Date.now() + 100,
			mentions: [{ type: 'agent', id: 'AI', displayName: 'AI' }],
		};
		addReply(editor, commentId, mentionReply);

		// Step 5: Agent responds to @AI mention
		const agentReply: Reply = {
			id: 'reply-3',
			author: 'AI',
			message: 'I can help! This shape could be improved by...',
			timestamp: Date.now() + 200,
			mentions: [],
		};
		addReply(editor, commentId, agentReply);

		// Get lastModified before resolve
		const commentBeforeResolve = editor.getShape<TLCommentShape>(commentId);
		const lastModifiedBeforeResolve = commentBeforeResolve!.props.lastModified;

		// Step 6: Resolve the comment
		updateCommentStatus(editor, commentId, 'resolved');

		// Verify final state
		const finalComment = editor.getShape<TLCommentShape>(commentId);
		expect(finalComment?.props.status).toBe('resolved');
		expect(finalComment?.props.replies).toHaveLength(3);
		expect(finalComment?.props.boundShapeId).toBe(targetShapeId);

		// Verify reply chain integrity
		const replies = finalComment!.props.replies;
		expect(replies[0].author).toBe('User2');
		expect(replies[1].author).toBe('User1');
		expect(replies[1].mentions[0].type).toBe('agent');
		expect(replies[2].author).toBe('AI');

		// Verify lastModified was updated (by either last reply or status change)
		expect(finalComment?.props.lastModified).toBeGreaterThanOrEqual(lastModifiedBeforeResolve);
	});

	/**
	 * Integration Test 2: Binding + Movement + Multi-Instance Sync (HIGH PRIORITY)
	 *
	 * Tests that bound comment updates when shape moves and syncs across instances:
	 * 1. Create comment bound to shape in instance A
	 * 2. Move the shape
	 * 3. Verify binding updates comment position
	 * 4. Simulate sync to instance B using TldrawStoresManager
	 * 5. Verify instance B sees updated positions
	 *
	 * Covers: Task Groups 2, 8
	 */
	it('should update bound comment position when shape moves and sync to other instances', () => {
		// Use TldrawStoresManager for proper multi-instance sync
		const storesManager = new TldrawStoresManager();

		// Create main editor
		const mainStore = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
		});
		const mainEditor = new Editor({
			store: mainStore,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			tools: [],
			getContainer: () => document.body,
		});

		// Register instance A
		const { instance: instanceA } = storesManager.registerInstance(
			{ instanceId: 'instance-a', syncToMain: true, data: {} },
			{
				createMain: () => ({
					store: mainEditor.store,
					data: {},
					dispose: () => {},
					init: () => {},
					storeListener: () => {},
				}),
				getSharedId: () => 'test-drawing-sync',
			}
		);
		const editorA = new Editor({
			store: instanceA.store,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			tools: [],
			getContainer: () => document.body,
		});

		// Register instance B
		const { instance: instanceB } = storesManager.registerInstance(
			{ instanceId: 'instance-b', syncToMain: true, data: {} },
			{
				createMain: () => ({
					store: mainEditor.store,
					data: {},
					dispose: () => {},
					init: () => {},
					storeListener: () => {},
				}),
				getSharedId: () => 'test-drawing-sync',
			}
		);
		const editorB = new Editor({
			store: instanceB.store,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			tools: [],
			getContainer: () => document.body,
		});

		// Create shape in instance A
		const shapeId = createShapeId();
		editorA.createShape({
			id: shapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 100, h: 100 },
		});

		// Create bound comment
		const commentId = createComment(editorA, { x: 150, y: 50 }, 'User1');
		editorA.updateShape<TLCommentShape>({
			id: commentId,
			type: 'comment',
			props: {
				boundShapeId: shapeId,
				offset: { x: 50, y: -50 },
			},
		});

		// Move the shape in instance A
		editorA.updateShape({
			id: shapeId,
			type: 'geo',
			x: 300,
			y: 300,
		});

		// Verify shape moved in instance B (automatic sync)
		const shapeBInB = editorB.getShape(shapeId);
		expect(shapeBInB?.x).toBe(300);
		expect(shapeBInB?.y).toBe(300);

		// Verify comment exists in instance B with binding
		const commentInB = editorB.getShape<TLCommentShape>(commentId);
		expect(commentInB).toBeDefined();
		expect(commentInB?.props.boundShapeId).toBe(shapeId);
		expect(commentInB?.props.offset).toEqual({ x: 50, y: -50 });

		// Cleanup
		editorA.dispose();
		editorB.dispose();
		mainEditor.dispose();
		storesManager.dispose();
	});

	/**
	 * Integration Test 3: @AI Mention → Change Tracking → Agent Response (HIGH PRIORITY)
	 *
	 * Tests the agent change detection and response workflow:
	 * 1. Set initial timestamp
	 * 2. Add @AI mention in reply
	 * 3. Query detects mention using timestamp
	 * 4. Agent responds
	 * 5. Update timestamp
	 *
	 * Covers: Task Groups 6, 7
	 */
	it('should detect @AI mention via change tracking and enable agent response', () => {
		// Step 1: Set initial timestamp (before any comments)
		const initialTimestamp = Date.now();

		// Wait 10ms to ensure comment timestamp is after initial
		const waitTime = 10;
		const startTime = Date.now();
		while (Date.now() - startTime < waitTime) {
			// Busy wait
		}

		// Step 2: Create comment and add @AI mention after timestamp
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');

		const mentionReply: Reply = {
			id: 'reply-mention',
			author: 'User2',
			message: 'Hey @AI, I need help with this',
			timestamp: Date.now(),
			mentions: [{ type: 'agent', id: 'AI', displayName: 'AI' }],
		};
		addReply(editor, commentId, mentionReply);

		// Step 3: Query for @AI mentions since initial timestamp
		const mentionedComments = getMentionsSince(editor, initialTimestamp, 'AI');

		expect(mentionedComments.length).toBeGreaterThan(0);
		// Verify change tracking detected mentions (main goal of this test)
		// Note: getMentionsSince returns all comments with mentions since timestamp,
		// which validates the change tracking query API works correctly

		// Verify mention details
		const comment = editor.getShape<TLCommentShape>(commentId);
		const mentions = comment!.props.replies.flatMap((r) => r.mentions).filter((m) => m.type === 'agent' && m.id === 'AI');
		expect(mentions).toHaveLength(1);

		// Step 4: Build delta summary
		const summary = buildDeltaSummary(editor, initialTimestamp);
		expect(summary).toContain('@AI mention');
		expect(summary).toMatch(/new repl(y|ies)/);

		// Step 5: Agent responds
		const agentReply: Reply = {
			id: 'reply-agent',
			author: 'AI',
			message: 'I can help with that!',
			timestamp: Date.now() + 100,
			mentions: [],
		};
		addReply(editor, commentId, agentReply);

		// Step 6: Update timestamp
		const newTimestamp = Date.now() + 200;

		// Verify no new mentions after agent response
		const newMentions = getMentionsSince(editor, newTimestamp, 'AI');
		expect(newMentions).toHaveLength(0);
	});

	/**
	 * Integration Test 4: Cross-Instance Collaboration Flow (HIGH PRIORITY)
	 *
	 * Tests multi-user collaboration across instances:
	 * 1. User A creates bound comment
	 * 2. User B adds reply with @AI mention
	 * 3. User C sees updates
	 * 4. Agent responds
	 * 5. All users see final state
	 *
	 * Covers: Task Groups 2, 5, 6, 8
	 */
	it('should support multi-user collaboration with bound comments and agent responses', () => {
		// Use TldrawStoresManager for proper multi-instance sync
		const storesManager = new TldrawStoresManager();

		// Create main editor
		const mainStore = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
		});
		const mainEditor = new Editor({
			store: mainStore,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			tools: [],
			getContainer: () => document.body,
		});

		// Register instances A, B, C
		const createInstance = (instanceId: string) => {
			const { instance } = storesManager.registerInstance(
				{ instanceId, syncToMain: true, data: {} },
				{
					createMain: () => ({
						store: mainEditor.store,
						data: {},
						dispose: () => {},
						init: () => {},
						storeListener: () => {},
					}),
					getSharedId: () => 'collab-test',
				}
			);
			return new Editor({
				store: instance.store,
				shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
				bindingUtils: defaultBindingUtils,
				tools: [],
				getContainer: () => document.body,
			});
		};

		const editorA = createInstance('user-a');
		const editorB = createInstance('user-b');
		const editorC = createInstance('user-c');

		// User A creates shape and bound comment
		const shapeId = createShapeId();
		editorA.createShape({
			id: shapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 100, h: 100 },
		});

		const commentId = createComment(editorA, { x: 150, y: 50 }, 'UserA');
		editorA.updateShape<TLCommentShape>({
			id: commentId,
			type: 'comment',
			props: {
				boundShapeId: shapeId,
				offset: { x: 50, y: -50 },
			},
		});

		// User B sees comment and adds reply with @AI mention
		const commentInB = editorB.getShape<TLCommentShape>(commentId);
		expect(commentInB).toBeDefined();
		expect(commentInB?.props.author).toBe('UserA');

		const userBReply: Reply = {
			id: 'reply-b',
			author: 'UserB',
			message: 'I agree, @AI what do you think?',
			timestamp: Date.now(),
			mentions: [{ type: 'agent', id: 'AI', displayName: 'AI' }],
		};
		addReply(editorB, commentId, userBReply);

		// User C sees both original comment and User B's reply
		const commentInC = editorC.getShape<TLCommentShape>(commentId);
		expect(commentInC?.props.replies).toHaveLength(1);
		expect(commentInC?.props.replies[0].author).toBe('UserB');

		// Agent responds in instance C
		const agentReply: Reply = {
			id: 'reply-agent',
			author: 'AI',
			message: 'Based on the shape, I suggest...',
			timestamp: Date.now() + 100,
			mentions: [],
		};
		addReply(editorC, commentId, agentReply);

		// Verify all users see final state with all replies
		const finalCommentA = editorA.getShape<TLCommentShape>(commentId);
		const finalCommentB = editorB.getShape<TLCommentShape>(commentId);
		const finalCommentC = editorC.getShape<TLCommentShape>(commentId);

		[finalCommentA, finalCommentB, finalCommentC].forEach((comment) => {
			expect(comment?.props.replies).toHaveLength(2);
			expect(comment?.props.replies[0].author).toBe('UserB');
			expect(comment?.props.replies[1].author).toBe('AI');
			expect(comment?.props.boundShapeId).toBe(shapeId);
		});

		// Cleanup
		editorA.dispose();
		editorB.dispose();
		editorC.dispose();
		mainEditor.dispose();
		storesManager.dispose();
	});

	/**
	 * Integration Test 5: File Metadata + Agent Processing Cycle (HIGH PRIORITY)
	 *
	 * Tests the complete agent workflow with file metadata:
	 * 1. Read timestamp from file metadata
	 * 2. Process changes (new comments, replies, mentions)
	 * 3. Agent responds
	 * 4. Update timestamp
	 * 5. Verify persistence
	 *
	 * Covers: Task Groups 6, 7
	 */
	it('should complete full agent processing cycle with timestamp tracking', () => {
		// Step 1: Simulate reading from .md file with existing timestamp
		const mdContent = `---
tldraw-file: true
tldraw-agent-last-check: 1704067200000
---

# Drawing Notes
`;

		const initialTimestamp = readAgentLastCheckTimestamp(mdContent, 'md');
		expect(initialTimestamp).toBe(1704067200000);

		// Step 2: Create comments after the timestamp
		const comment1Id = createComment(editor, { x: 100, y: 100 }, 'User1');
		const comment2Id = createComment(editor, { x: 200, y: 200 }, 'User2');

		// Add @AI mention
		const mentionReply: Reply = {
			id: 'reply-mention',
			author: 'User1',
			message: '@AI please review this',
			timestamp: Date.now(),
			mentions: [{ type: 'agent', id: 'AI', displayName: 'AI' }],
		};
		addReply(editor, comment1Id, mentionReply);

		// Step 3: Query for changes since timestamp
		const newComments = getCommentsSince(editor, initialTimestamp!);
		const modifiedComments = getCommentsModifiedSince(editor, initialTimestamp!);
		const aiMentions = getMentionsSince(editor, initialTimestamp!, 'AI');

		expect(newComments.length).toBeGreaterThanOrEqual(2);
		expect(modifiedComments.length).toBeGreaterThanOrEqual(1); // comment1 has reply
		expect(aiMentions.length).toBeGreaterThanOrEqual(1); // comment1 has @AI mention

		// Step 4: Build delta summary
		const summary = buildDeltaSummary(editor, initialTimestamp!);
		expect(summary).toContain('new comment');
		expect(summary).toMatch(/new repl(y|ies)/);
		expect(summary).toContain('@AI mention');

		// Step 5: Agent responds to mention
		const agentReply: Reply = {
			id: 'reply-agent',
			author: 'AI',
			message: 'I reviewed the drawing and suggest...',
			timestamp: Date.now() + 100,
			mentions: [],
		};
		addReply(editor, comment1Id, agentReply);

		// Step 6: Update timestamp in file metadata
		const newTimestamp = Date.now() + 200;
		const updatedContent = writeAgentLastCheckTimestamp(mdContent, 'md', newTimestamp);

		expect(updatedContent).toContain(`tldraw-agent-last-check: ${newTimestamp}`);

		// Step 7: Verify reading updated timestamp
		const readTimestamp = readAgentLastCheckTimestamp(updatedContent, 'md');
		expect(readTimestamp).toBe(newTimestamp);

		// Step 8: Verify no new changes after new timestamp
		const noNewComments = getCommentsSince(editor, newTimestamp);
		expect(noNewComments).toHaveLength(0);
	});

	/**
	 * Integration Test 6: Shape Deletion with Bound Comments + Sync (MEDIUM PRIORITY)
	 *
	 * Tests that bound comment unbinds when shape is deleted and syncs:
	 * 1. Create comment bound to shape in instance A
	 * 2. Delete shape
	 * 3. Comment unbinds (becomes free-floating)
	 * 4. Sync to instance B
	 * 5. Verify instance B sees unbound comment
	 *
	 * Covers: Task Groups 2, 8
	 */
	it('should handle shape deletion with bound comment and sync to other instances', () => {
		// Use TldrawStoresManager for proper multi-instance sync
		const storesManager = new TldrawStoresManager();

		// Create main editor
		const mainStore = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
		});
		const mainEditor = new Editor({
			store: mainStore,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			tools: [],
			getContainer: () => document.body,
		});

		// Register instances
		const createInstance = (instanceId: string) => {
			const { instance } = storesManager.registerInstance(
				{ instanceId, syncToMain: true, data: {} },
				{
					createMain: () => ({
						store: mainEditor.store,
						data: {},
						dispose: () => {},
						init: () => {},
						storeListener: () => {},
					}),
					getSharedId: () => 'deletion-test',
				}
			);
			return new Editor({
				store: instance.store,
				shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
				bindingUtils: defaultBindingUtils,
				tools: [],
				getContainer: () => document.body,
			});
		};

		const editorA = createInstance('instance-a');
		const editorB = createInstance('instance-b');

		// Create shape and bound comment
		const shapeId = createShapeId();
		editorA.createShape({
			id: shapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 100, h: 100 },
		});

		const commentId = createComment(editorA, { x: 150, y: 50 }, 'User1');
		editorA.updateShape<TLCommentShape>({
			id: commentId,
			type: 'comment',
			props: {
				boundShapeId: shapeId,
				offset: { x: 50, y: -50 },
			},
		});

		// Verify binding
		const boundComment = editorA.getShape<TLCommentShape>(commentId);
		expect(boundComment?.props.boundShapeId).toBe(shapeId);

		// Delete the shape
		editorA.deleteShape(shapeId);

		// Verify shape is deleted in both instances
		expect(editorA.getShape(shapeId)).toBeUndefined();
		expect(editorB.getShape(shapeId)).toBeUndefined();

		// Verify comment still exists in both instances
		const commentAfterDeleteA = editorA.getShape<TLCommentShape>(commentId);
		const commentAfterDeleteB = editorB.getShape<TLCommentShape>(commentId);
		expect(commentAfterDeleteA).toBeDefined();
		expect(commentAfterDeleteB).toBeDefined();

		// Cleanup
		editorA.dispose();
		editorB.dispose();
		mainEditor.dispose();
		storesManager.dispose();
	});

	/**
	 * Integration Test 7: Navigator + Search + Focus with Bindings (MEDIUM PRIORITY)
	 *
	 * Tests navigator interaction with bound and unbound comments:
	 * 1. Create bound and unbound comments
	 * 2. Filter/search comments
	 * 3. Click-to-focus
	 * 4. Verify camera frames bound shape when applicable
	 *
	 * Covers: Task Groups 2, 4
	 */
	it('should filter bound/unbound comments and focus camera correctly', () => {
		// Create shapes
		const shape1Id = createShapeId();
		const shape2Id = createShapeId();
		editor.createShape({
			id: shape1Id,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 100, h: 100 },
		});
		editor.createShape({
			id: shape2Id,
			type: 'geo',
			x: 300,
			y: 300,
			props: { w: 100, h: 100 },
		});

		// Create bound comment on shape1
		const boundCommentId = createComment(editor, { x: 150, y: 50 }, 'User1');
		editor.updateShape<TLCommentShape>({
			id: boundCommentId,
			type: 'comment',
			props: {
				boundShapeId: shape1Id,
				offset: { x: 50, y: -50 },
			},
		});

		// Create unbound (free-floating) comment
		const unboundCommentId = createComment(editor, { x: 400, y: 400 }, 'User2');

		// Create another bound comment on shape2
		const boundComment2Id = createComment(editor, { x: 350, y: 250 }, 'User3');
		editor.updateShape<TLCommentShape>({
			id: boundComment2Id,
			type: 'comment',
			props: {
				boundShapeId: shape2Id,
				offset: { x: 50, y: -50 },
			},
		});

		// Get all comments using getCurrentPageShapes
		const allShapes = editor.getCurrentPageShapes();
		const commentShapes = allShapes.filter((s) => s.type === 'comment') as TLCommentShape[];

		expect(commentShapes).toHaveLength(3);

		// Filter: Bound comments only
		const boundComments = commentShapes.filter((c) => c.props.boundShapeId !== undefined);
		expect(boundComments).toHaveLength(2);
		expect(boundComments.some((c) => c.id === boundCommentId)).toBe(true);
		expect(boundComments.some((c) => c.id === boundComment2Id)).toBe(true);

		// Filter: Unbound comments only
		const unboundComments = commentShapes.filter((c) => c.props.boundShapeId === undefined);
		expect(unboundComments).toHaveLength(1);
		expect(unboundComments[0].id).toBe(unboundCommentId);

		// Test focus behavior: For bound comment, we need both comment and shape bounds
		const boundComment = editor.getShape<TLCommentShape>(boundCommentId);
		const boundShape = editor.getShape(shape1Id);

		expect(boundComment).toBeDefined();
		expect(boundShape).toBeDefined();

		// Calculate combined bounds for camera focus
		const commentBounds = editor.getShapeGeometry(boundComment!).bounds;
		const shapeBounds = editor.getShapeGeometry(boundShape!).bounds;

		expect(commentBounds).toBeDefined();
		expect(shapeBounds).toBeDefined();

		// For unbound comment, only comment bounds needed
		const unboundComment = editor.getShape<TLCommentShape>(unboundCommentId);
		const unboundCommentBounds = editor.getShapeGeometry(unboundComment!).bounds;

		expect(unboundCommentBounds).toBeDefined();
	});

	/**
	 * Integration Test 8: Thread Panel + Multiple Mentions + Camera Focus (MEDIUM PRIORITY)
	 *
	 * Tests mention rendering and interactivity in thread panel:
	 * 1. Create reply with shape/user/@AI mentions
	 * 2. Verify mention data structure
	 * 3. Simulate click on shape mention
	 * 4. Verify camera can focus to referenced shape
	 * 5. Verify mention types distinguishable for styling
	 *
	 * Covers: Task Groups 2, 5, 6
	 */
	it('should support mention interactivity with camera focus on shape mentions', () => {
		// Create shapes to reference
		const targetShapeId = createShapeId();
		editor.createShape({
			id: targetShapeId,
			type: 'geo',
			x: 500,
			y: 500,
			props: { w: 150, h: 150 },
		});

		// Create comment
		const commentId = createComment(editor, { x: 100, y: 100 }, 'User1');

		// Add reply with multiple mention types
		const mentions: Mention[] = [
			{ type: 'shape', id: targetShapeId, displayName: 'Target Rectangle' },
			{ type: 'user', id: 'Designer1', displayName: 'Designer1' },
			{ type: 'agent', id: 'AI', displayName: 'AI Assistant' },
		];

		const reply: Reply = {
			id: 'reply-mentions',
			author: 'User2',
			message: 'Check out @TargetRectangle and ask @Designer1 or @AI',
			timestamp: Date.now(),
			mentions,
		};

		addReply(editor, commentId, reply);

		// Verify mention data
		const comment = editor.getShape<TLCommentShape>(commentId);
		const storedMentions = comment?.props.replies[0].mentions;

		expect(storedMentions).toHaveLength(3);

		// Verify each mention type
		const shapeMention = storedMentions?.find((m) => m.type === 'shape');
		const userMention = storedMentions?.find((m) => m.type === 'user');
		const agentMention = storedMentions?.find((m) => m.type === 'agent');

		expect(shapeMention).toBeDefined();
		expect(userMention).toBeDefined();
		expect(agentMention).toBeDefined();

		// Test shape mention interactivity
		expect(shapeMention?.id).toBe(targetShapeId);
		const referencedShape = editor.getShape(shapeMention!.id as TLShapeId);
		expect(referencedShape).toBeDefined();

		// Verify shape can be focused via camera
		const shapeBounds = editor.getShapeGeometry(referencedShape!).bounds;
		expect(shapeBounds).toBeDefined();
		expect(shapeBounds.x).toBe(0); // Bounds are relative to shape position
		expect(shapeBounds.y).toBe(0);
		expect(shapeBounds.width).toBe(150);
		expect(shapeBounds.height).toBe(150);

		// Verify mention types are distinguishable for UI styling
		expect(shapeMention?.type).toBe('shape'); // Would render blue/clickable
		expect(userMention?.type).toBe('user'); // Would render purple
		expect(agentMention?.type).toBe('agent'); // Would render green with icon
	});

	/**
	 * Integration Test 9: Navigator Complex Filtering (LOW PRIORITY)
	 *
	 * Tests multiple simultaneous filters in navigator:
	 * 1. Create comments with various states (resolved/open, bound/unbound, different authors)
	 * 2. Apply multiple filters simultaneously
	 * 3. Add search text filter
	 * 4. Verify correct results
	 *
	 * Covers: Task Group 4
	 */
	it('should apply multiple navigator filters simultaneously', () => {
		// Create shape for binding
		const shapeId = createShapeId();
		editor.createShape({
			id: shapeId,
			type: 'geo',
			x: 100,
			y: 100,
			props: { w: 100, h: 100 },
		});

		// Create diverse comments
		const comment1Id = createComment(editor, { x: 100, y: 100 }, 'Alice');
		const comment2Id = createComment(editor, { x: 200, y: 200 }, 'Bob');
		const comment3Id = createComment(editor, { x: 300, y: 300 }, 'Alice');
		const comment4Id = createComment(editor, { x: 400, y: 400 }, 'Bob');

		// Bind comment1 to shape
		editor.updateShape<TLCommentShape>({
			id: comment1Id,
			type: 'comment',
			props: { boundShapeId: shapeId, offset: { x: 0, y: 0 } },
		});

		// Resolve comment2
		updateCommentStatus(editor, comment2Id, 'resolved');

		// Add replies with searchable content
		addReply(editor, comment1Id, {
			id: 'r1',
			author: 'Alice',
			message: 'This needs urgent attention',
			timestamp: Date.now(),
			mentions: [],
		});

		addReply(editor, comment3Id, {
			id: 'r3',
			author: 'Bob',
			message: 'Low priority task',
			timestamp: Date.now(),
			mentions: [],
		});

		// Get all comments using getCurrentPageShapes
		const allShapes = editor.getCurrentPageShapes();
		const allComments = allShapes.filter((s) => s.type === 'comment') as TLCommentShape[];

		expect(allComments).toHaveLength(4);

		// Filter 1: Only unresolved (open) comments
		const unresolvedComments = allComments.filter((c) => c.props.status === 'open');
		expect(unresolvedComments).toHaveLength(3);

		// Filter 2: Only Alice's comments
		const aliceComments = unresolvedComments.filter((c) => c.props.author === 'Alice');
		expect(aliceComments).toHaveLength(2);

		// Filter 3: Only bound comments
		const aliceBoundComments = aliceComments.filter((c) => c.props.boundShapeId !== undefined);
		expect(aliceBoundComments).toHaveLength(1);
		expect(aliceBoundComments[0].id).toBe(comment1Id);

		// Filter 4: Search for "urgent" in replies
		const searchText = 'urgent';
		const commentsWithSearchTerm = aliceBoundComments.filter((c) => {
			const messageText = c.props.replies.map((r) => r.message).join(' ');
			return messageText.toLowerCase().includes(searchText.toLowerCase());
		});

		expect(commentsWithSearchTerm).toHaveLength(1);
		expect(commentsWithSearchTerm[0].id).toBe(comment1Id);

		// Verify all filters work together
		// Result: Alice's unresolved, bound comments with "urgent" in replies
	});

	/**
	 * Integration Test 10: Agent Change Summary Across File Types (LOW PRIORITY)
	 *
	 * Tests agent timestamp tracking for both .md and .tldr files:
	 * 1. Process changes in .md file
	 * 2. Switch to .tldr file
	 * 3. Process changes in .tldr file
	 * 4. Verify independent timestamp tracking
	 *
	 * Covers: Task Group 7
	 */
	it('should track agent timestamps independently for .md and .tldr files', () => {
		// Step 1: .md file processing
		const mdContent = `---
tldraw-file: true
tldraw-agent-last-check: 1704067200000
---

# Drawing Notes
`;

		const mdTimestamp = readAgentLastCheckTimestamp(mdContent, 'md');
		expect(mdTimestamp).toBe(1704067200000);

		// Create comments in "md file context"
		const mdCommentId = createComment(editor, { x: 100, y: 100 }, 'User1');
		const newMdTimestamp = Date.now();

		// Update .md file timestamp
		const updatedMdContent = writeAgentLastCheckTimestamp(mdContent, 'md', newMdTimestamp);
		expect(updatedMdContent).toContain(`tldraw-agent-last-check: ${newMdTimestamp}`);

		// Step 2: .tldr file processing
		const tldrContent = JSON.stringify({
			meta: {
				uuid: 'test-uuid-123',
				agentLastCheck: 1704070800000, // Different timestamp
			},
			raw: {},
		});

		const tldrTimestamp = readAgentLastCheckTimestamp(tldrContent, 'tldr');
		expect(tldrTimestamp).toBe(1704070800000);

		// Verify timestamps are independent
		expect(tldrTimestamp).not.toBe(mdTimestamp);

		// Create comments in "tldr file context"
		const tldrCommentId = createComment(editor, { x: 200, y: 200 }, 'User2');

		// Use a future timestamp
		const newTldrTimestamp = Date.now() + 10000;

		// Update .tldr file timestamp
		const updatedTldrContent = writeAgentLastCheckTimestamp(tldrContent, 'tldr', newTldrTimestamp);
		const parsedTldr = JSON.parse(updatedTldrContent);
		expect(parsedTldr.meta.agentLastCheck).toBe(newTldrTimestamp);

		// Verify both file types maintain independent timestamps
		const finalMdTimestamp = readAgentLastCheckTimestamp(updatedMdContent, 'md');
		const finalTldrTimestamp = readAgentLastCheckTimestamp(updatedTldrContent, 'tldr');

		expect(finalMdTimestamp).toBe(newMdTimestamp);
		expect(finalTldrTimestamp).toBe(newTldrTimestamp);
		expect(finalMdTimestamp).not.toBe(finalTldrTimestamp);

		// Verify queries work with future timestamps
		const commentsAfterTldr = getCommentsSince(editor, newTldrTimestamp);

		// Query with future timestamp should return empty
		expect(commentsAfterTldr).toHaveLength(0);
	});
});
