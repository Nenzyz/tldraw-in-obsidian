import { describe, it, expect, beforeEach } from 'vitest';
import { createTLStore, defaultShapeUtils, defaultBindingUtils, Editor, TLShapeId } from 'tldraw';
import { CommentShapeUtil } from '../../tldraw/shapes/comment';
import { createComment, addReply } from '../../tldraw/shapes/comment/utils/comment-helpers';
import {
	getCommentsSince,
	getCommentsModifiedSince,
	getMentionsSince,
	getUnresolvedComments,
	getCommentsByAuthor,
	buildDeltaSummary,
} from '../../tldraw/shapes/comment/utils/change-tracking';
import type { Reply, Mention } from '../../tldraw/shapes/comment/CommentShape';
import {
	readAgentLastCheckTimestamp,
	writeAgentLastCheckTimestamp,
} from '../../utils/file-metadata';

describe('Comment Change Tracking', () => {
	let editor: Editor;
	let baseTimestamp: number;

	beforeEach(() => {
		// Create a store with CommentShapeUtil and default shape utils
		const store = createTLStore({
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
		});

		// Create editor instance
		editor = new Editor({
			store,
			shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
			bindingUtils: defaultBindingUtils,
			getContainer: () => document.createElement('div'),
			tools: [],
		});

		// Set base timestamp for tests
		baseTimestamp = Date.now() - 10000; // 10 seconds ago
	});

	describe('7.1.1 - getCommentsSince', () => {
		it('should return comments created after the given timestamp', () => {
			// Create comments at different times
			const oldCommentId = createComment(editor, { x: 0, y: 0 }, 'User1');
			const oldComment = editor.getShape(oldCommentId);
			editor.updateShape({
				id: oldCommentId,
				type: 'comment',
				props: {
					...oldComment!.props,
					createdAt: baseTimestamp - 5000, // Before baseTimestamp
				},
			});

			const newCommentId = createComment(editor, { x: 100, y: 100 }, 'User2');
			const newComment = editor.getShape(newCommentId);
			editor.updateShape({
				id: newCommentId,
				type: 'comment',
				props: {
					...newComment!.props,
					createdAt: baseTimestamp + 1000, // After baseTimestamp
				},
			});

			// Query for comments since baseTimestamp
			const recentComments = getCommentsSince(editor, baseTimestamp);

			// Should only return the new comment
			expect(recentComments).toHaveLength(1);
			expect(recentComments[0].id).toBe(newCommentId);
			expect(recentComments[0].props.author).toBe('User2');
		});

		it('should return empty array if no comments exist after timestamp', () => {
			// Create old comment
			const oldCommentId = createComment(editor, { x: 0, y: 0 }, 'User1');
			const oldComment = editor.getShape(oldCommentId);
			editor.updateShape({
				id: oldCommentId,
				type: 'comment',
				props: {
					...oldComment!.props,
					createdAt: baseTimestamp - 5000,
				},
			});

			const recentComments = getCommentsSince(editor, baseTimestamp);
			expect(recentComments).toHaveLength(0);
		});
	});

	describe('7.1.2 - getCommentsModifiedSince', () => {
		it('should return comments with replies added after the given timestamp', () => {
			// Create comment before baseTimestamp
			const commentId = createComment(editor, { x: 0, y: 0 }, 'User1');
			const comment = editor.getShape(commentId);
			editor.updateShape({
				id: commentId,
				type: 'comment',
				props: {
					...comment!.props,
					createdAt: baseTimestamp - 5000,
					lastModified: baseTimestamp - 5000,
				},
			});

			// Add reply after baseTimestamp
			const reply: Reply = {
				id: 'reply-1',
				author: 'User2',
				message: 'This is a reply',
				timestamp: baseTimestamp + 1000,
				mentions: [],
			};
			addReply(editor, commentId, reply);

			// Query for modified comments
			const modifiedComments = getCommentsModifiedSince(editor, baseTimestamp);

			// Should return the comment with new reply
			expect(modifiedComments).toHaveLength(1);
			expect(modifiedComments[0].id).toBe(commentId);
			expect(modifiedComments[0].props.replies).toHaveLength(1);
		});

		it('should not return comments with no recent modifications', () => {
			// Create comment with old lastModified
			const commentId = createComment(editor, { x: 0, y: 0 }, 'User1');
			const comment = editor.getShape(commentId);
			editor.updateShape({
				id: commentId,
				type: 'comment',
				props: {
					...comment!.props,
					createdAt: baseTimestamp - 5000,
					lastModified: baseTimestamp - 2000, // Before baseTimestamp
				},
			});

			const modifiedComments = getCommentsModifiedSince(editor, baseTimestamp);
			expect(modifiedComments).toHaveLength(0);
		});
	});

	describe('7.1.3 - getMentionsSince', () => {
		it('should return comments with @AI mentions after the given timestamp', () => {
			// Create comment with old timestamp
			const commentId = createComment(editor, { x: 0, y: 0 }, 'User1');

			// Add reply with @AI mention after baseTimestamp
			const aiMention: Mention = {
				type: 'agent',
				id: 'AI',
				displayName: 'AI',
			};
			const reply: Reply = {
				id: 'reply-1',
				author: 'User2',
				message: 'Hey @AI, can you help?',
				timestamp: baseTimestamp + 1000,
				mentions: [aiMention],
			};
			addReply(editor, commentId, reply);

			// Query for @AI mentions
			const aiMentions = getMentionsSince(editor, baseTimestamp, 'AI');

			// Should return the comment with @AI mention
			expect(aiMentions).toHaveLength(1);
			expect(aiMentions[0].comment.id).toBe(commentId);
			expect(aiMentions[0].replies).toHaveLength(1);
			expect(aiMentions[0].replies[0].mentions).toContainEqual(aiMention);
		});

		it('should not return mentions before the given timestamp', () => {
			const commentId = createComment(editor, { x: 0, y: 0 }, 'User1');

			// Add reply with @AI mention BEFORE baseTimestamp
			const aiMention: Mention = {
				type: 'agent',
				id: 'AI',
				displayName: 'AI',
			};
			const reply: Reply = {
				id: 'reply-1',
				author: 'User2',
				message: 'Hey @AI, can you help?',
				timestamp: baseTimestamp - 1000, // Before baseTimestamp
				mentions: [aiMention],
			};
			addReply(editor, commentId, reply);

			const aiMentions = getMentionsSince(editor, baseTimestamp, 'AI');
			expect(aiMentions).toHaveLength(0);
		});
	});

	describe('7.1.4 - getUnresolvedComments', () => {
		it('should return all comments with status "open"', () => {
			// Create open comment
			const openCommentId = createComment(editor, { x: 0, y: 0 }, 'User1');

			// Create resolved comment
			const resolvedCommentId = createComment(editor, { x: 100, y: 100 }, 'User2');
			const resolvedComment = editor.getShape(resolvedCommentId);
			editor.updateShape({
				id: resolvedCommentId,
				type: 'comment',
				props: {
					...resolvedComment!.props,
					status: 'resolved',
				},
			});

			// Query for unresolved comments
			const unresolvedComments = getUnresolvedComments(editor);

			// Should only return open comment
			expect(unresolvedComments).toHaveLength(1);
			expect(unresolvedComments[0].id).toBe(openCommentId);
			expect(unresolvedComments[0].props.status).toBe('open');
		});
	});

	describe('7.1.5 - getCommentsByAuthor', () => {
		it('should return all comments by a specific author', () => {
			// Create comments by different authors
			const user1Comment1 = createComment(editor, { x: 0, y: 0 }, 'User1');
			const user1Comment2 = createComment(editor, { x: 50, y: 50 }, 'User1');
			const user2Comment = createComment(editor, { x: 100, y: 100 }, 'User2');

			// Query for User1 comments
			const user1Comments = getCommentsByAuthor(editor, 'User1');

			// Should return both User1 comments
			expect(user1Comments).toHaveLength(2);
			expect(user1Comments.map((c) => c.id)).toContain(user1Comment1);
			expect(user1Comments.map((c) => c.id)).toContain(user1Comment2);
			expect(user1Comments.map((c) => c.id)).not.toContain(user2Comment);
		});
	});

	describe('7.1.6 - buildDeltaSummary', () => {
		it('should generate accurate delta summary with counts', () => {
			const now = Date.now();

			// Create new comment after baseTimestamp
			const newCommentId = createComment(editor, { x: 0, y: 0 }, 'User1');
			const newComment = editor.getShape(newCommentId);
			editor.updateShape({
				id: newCommentId,
				type: 'comment',
				props: {
					...newComment!.props,
					createdAt: baseTimestamp + 1000,
				},
			});

			// Create comment with new replies (created BEFORE baseTimestamp)
			const modifiedCommentId = createComment(editor, { x: 100, y: 100 }, 'User2');
			const modifiedComment = editor.getShape(modifiedCommentId);
			editor.updateShape({
				id: modifiedCommentId,
				type: 'comment',
				props: {
					...modifiedComment!.props,
					createdAt: baseTimestamp - 5000,
					lastModified: baseTimestamp - 5000,
				},
			});

			// Add 2 replies
			const reply1: Reply = {
				id: 'reply-1',
				author: 'User3',
				message: 'First reply',
				timestamp: baseTimestamp + 2000,
				mentions: [],
			};
			const reply2: Reply = {
				id: 'reply-2',
				author: 'User4',
				message: 'Second reply with @AI',
				timestamp: baseTimestamp + 3000,
				mentions: [{ type: 'agent', id: 'AI', displayName: 'AI' }],
			};
			addReply(editor, modifiedCommentId, reply1);
			addReply(editor, modifiedCommentId, reply2);

			// Add unresolved comment (created BEFORE baseTimestamp)
			const unresolvedCommentId = createComment(editor, { x: 200, y: 200 }, 'User5');
			const unresolvedComment = editor.getShape(unresolvedCommentId);
			editor.updateShape({
				id: unresolvedCommentId,
				type: 'comment',
				props: {
					...unresolvedComment!.props,
					createdAt: baseTimestamp - 3000,
				},
			});

			// Build delta summary
			const summary = buildDeltaSummary(editor, baseTimestamp);

			// Verify summary contains correct counts
			expect(summary).toContain('1 new comments');
			expect(summary).toContain('2 new replies');
			expect(summary).toContain('1 @AI mentions');
			expect(summary).toContain('Unresolved comments: 3 total');
		});

		it('should prioritize @AI mentions in summary', () => {
			const commentId = createComment(editor, { x: 0, y: 0 }, 'User1');

			const aiReply: Reply = {
				id: 'reply-1',
				author: 'User2',
				message: '@AI please review this',
				timestamp: baseTimestamp + 1000,
				mentions: [{ type: 'agent', id: 'AI', displayName: 'AI' }],
			};
			addReply(editor, commentId, aiReply);

			const summary = buildDeltaSummary(editor, baseTimestamp);

			// Summary should mention @AI mentions prominently
			expect(summary).toContain('1 @AI mentions');
			expect(summary.indexOf('@AI mentions')).toBeLessThan(
				summary.indexOf('Unresolved comments')
			);
		});
	});

	describe('7.1.7 - File metadata timestamp persistence (markdown)', () => {
		it('should read lastCheckedTimestamp from markdown frontmatter', () => {
			const markdownContent = `---
tldraw-file: true
tldraw-agent-last-check: 1704067200000
---

# My Drawing

\`\`\`json tldraw-data-start
{"meta": {"uuid": "test-uuid"}, "raw": {}}
tldraw-data-end
\`\`\`
`;

			const timestamp = readAgentLastCheckTimestamp(markdownContent, 'md');
			expect(timestamp).toBe(1704067200000);
		});

		it('should handle missing timestamp in markdown frontmatter', () => {
			const markdownContent = `---
tldraw-file: true
---

# My Drawing
`;

			const timestamp = readAgentLastCheckTimestamp(markdownContent, 'md');
			expect(timestamp).toBeUndefined();
		});

		it('should write lastCheckedTimestamp to markdown frontmatter', () => {
			const markdownContent = `---
tldraw-file: true
---

# My Drawing

\`\`\`json tldraw-data-start
{"meta": {"uuid": "test-uuid"}, "raw": {}}
tldraw-data-end
\`\`\`
`;

			const newTimestamp = Date.now();
			const updatedContent = writeAgentLastCheckTimestamp(
				markdownContent,
				'md',
				newTimestamp
			);

			// Verify timestamp was written
			expect(updatedContent).toContain(`tldraw-agent-last-check: ${newTimestamp}`);
		});

		it('should update existing timestamp in markdown frontmatter', () => {
			const markdownContent = `---
tldraw-file: true
tldraw-agent-last-check: 1704067200000
---

# My Drawing
`;

			const newTimestamp = 1704153600000;
			const updatedContent = writeAgentLastCheckTimestamp(
				markdownContent,
				'md',
				newTimestamp
			);

			// Verify timestamp was updated
			expect(updatedContent).toContain(`tldraw-agent-last-check: ${newTimestamp}`);
			expect(updatedContent).not.toContain('tldraw-agent-last-check: 1704067200000');
		});
	});

	describe('7.1.8 - File metadata timestamp persistence (.tldr)', () => {
		it('should read lastCheckedTimestamp from .tldr meta object', () => {
			const tldrContent = JSON.stringify({
				meta: {
					uuid: 'test-uuid',
					'plugin-version': '1.0.0',
					'tldraw-version': '2.0.0',
					agentLastCheck: 1704067200000,
				},
				raw: {},
			});

			const timestamp = readAgentLastCheckTimestamp(tldrContent, 'tldr');
			expect(timestamp).toBe(1704067200000);
		});

		it('should handle missing timestamp in .tldr meta object', () => {
			const tldrContent = JSON.stringify({
				meta: {
					uuid: 'test-uuid',
					'plugin-version': '1.0.0',
					'tldraw-version': '2.0.0',
				},
				raw: {},
			});

			const timestamp = readAgentLastCheckTimestamp(tldrContent, 'tldr');
			expect(timestamp).toBeUndefined();
		});

		it('should write lastCheckedTimestamp to .tldr meta object', () => {
			const tldrContent = JSON.stringify({
				meta: {
					uuid: 'test-uuid',
					'plugin-version': '1.0.0',
					'tldraw-version': '2.0.0',
				},
				raw: {},
			});

			const newTimestamp = Date.now();
			const updatedContent = writeAgentLastCheckTimestamp(tldrContent, 'tldr', newTimestamp);

			const parsed = JSON.parse(updatedContent);
			expect(parsed.meta.agentLastCheck).toBe(newTimestamp);
		});

		it('should update existing timestamp in .tldr meta object', () => {
			const tldrContent = JSON.stringify({
				meta: {
					uuid: 'test-uuid',
					'plugin-version': '1.0.0',
					'tldraw-version': '2.0.0',
					agentLastCheck: 1704067200000,
				},
				raw: {},
			});

			const newTimestamp = 1704153600000;
			const updatedContent = writeAgentLastCheckTimestamp(tldrContent, 'tldr', newTimestamp);

			const parsed = JSON.parse(updatedContent);
			expect(parsed.meta.agentLastCheck).toBe(newTimestamp);
			expect(parsed.meta.agentLastCheck).not.toBe(1704067200000);
		});
	});
});
