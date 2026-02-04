import { TLShapeId } from 'tldraw'
import z from 'zod'
import { AgentHelpers } from '../../AgentHelpers'
import { Streaming } from '../../types/Streaming'
import { AgentActionUtil } from '../AgentActionUtil'
import { TLCommentShape } from '../../../../tldraw/shapes/comment/CommentShape'
import {
	getCommentsSince,
	getCommentsModifiedSince,
	getMentionsSince,
	getUnresolvedComments,
	getCommentsByAuthor,
} from '../../../../tldraw/shapes/comment/utils/change-tracking'
import { getCommentsForShape } from '../../../../tldraw/shapes/comment/utils/comment-helpers'

const ReadCommentsAction = z.object({
	_type: z.literal('read_comments'),
	filters: z
		.object({
			status: z.enum(['open', 'resolved']).optional(),
			boundShapeId: z.string().optional(),
			since: z.number().optional(),
			modifiedSince: z.number().optional(),
			authorId: z.string().optional(),
			mentionId: z.string().optional(),
		})
		.optional(),
})

type ReadCommentsAction = z.infer<typeof ReadCommentsAction>

export class ReadCommentsActionUtil extends AgentActionUtil<ReadCommentsAction> {
	static override type = 'read_comments' as const

	override getSchema() {
		return ReadCommentsAction
	}

	override getInfo(action: Streaming<ReadCommentsAction>) {
		return {
			icon: 'message-circle' as const,
			description: 'Reading comments',
		}
	}

	override async applyAction(action: Streaming<ReadCommentsAction>, helpers: AgentHelpers) {
		if (!action.complete) return
		if (!this.editor) return

		const { agent } = helpers
		const { filters } = action
		let comments: TLCommentShape[] = []

		// Start with all comments on the page
		const allShapes = this.editor.getCurrentPageShapes()
		comments = allShapes.filter((s) => s.type === 'comment') as TLCommentShape[]

		// Apply filters
		if (filters) {
			if (filters.status) {
				comments = comments.filter((c) => c.props.status === filters.status)
			}
			if (filters.boundShapeId) {
				comments = getCommentsForShape(this.editor, filters.boundShapeId as TLShapeId)
			}
			if (filters.since) {
				comments = getCommentsSince(this.editor, filters.since)
			}
			if (filters.modifiedSince) {
				comments = getCommentsModifiedSince(this.editor, filters.modifiedSince)
			}
			if (filters.authorId) {
				comments = getCommentsByAuthor(this.editor, filters.authorId)
			}
			if (filters.mentionId) {
				const results = getMentionsSince(this.editor, 0, filters.mentionId)
				comments = results.map((r) => r.comment)
			}
		}

		// Format comments for the agent
		const commentSummaries = comments.map((c) => ({
			id: c.id,
			author: c.props.author,
			status: c.props.status,
			replyCount: c.props.replies.length,
			boundShapeId: c.props.boundShapeId || null,
			position: { x: Math.round(c.x), y: Math.round(c.y) },
		}))

		// Schedule data for next request
		agent.schedule({
			data: [
				`Found ${comments.length} comment(s):\n${JSON.stringify(commentSummaries, null, 2)}`,
			],
		})
	}

	override savesToHistory(): boolean {
		return false
	}
}
