import { TLShapeId } from 'tldraw'
import z from 'zod'
import { AgentHelpers } from '../../AgentHelpers'
import { Streaming } from '../../types/Streaming'
import { AgentActionUtil } from '../AgentActionUtil'
import { TLCommentShape } from '../../../../tldraw/shapes/comment/CommentShape'

const GetCommentDetailsAction = z.object({
	_type: z.literal('get_comment_details'),
	commentIds: z.array(z.string()),
})

type GetCommentDetailsAction = z.infer<typeof GetCommentDetailsAction>

interface CommentDetails {
	id: string
	position: { x: number; y: number }
	author: string
	status: string
	createdAt: number
	lastModified: number
	boundShapeId?: string
	boundShapeType?: string
	replies: Array<{
		id: string
		author: string
		message: string
		timestamp: number
		mentions: Array<{
			type: string
			id: string
			displayName: string
		}>
	}>
}

export class GetCommentDetailsActionUtil extends AgentActionUtil<GetCommentDetailsAction> {
	static override type = 'get_comment_details' as const

	override getSchema() {
		return GetCommentDetailsAction
	}

	override getInfo(action: Streaming<GetCommentDetailsAction>) {
		const count = action.commentIds?.length ?? 0
		return {
			icon: 'message-circle' as const,
			description: `Getting details for ${count} comment(s)`,
		}
	}

	override async applyAction(action: Streaming<GetCommentDetailsAction>, helpers: AgentHelpers) {
		if (!action.complete) return
		if (!this.editor) return

		const { agent } = helpers
		const { commentIds } = action
		const details: CommentDetails[] = []

		for (const commentId of commentIds) {
			const comment = this.editor.getShape<TLCommentShape>(commentId as TLShapeId)

			if (!comment || comment.type !== 'comment') {
				continue
			}

			const detail: CommentDetails = {
				id: comment.id,
				position: { x: comment.x, y: comment.y },
				author: comment.props.author,
				status: comment.props.status,
				createdAt: comment.props.createdAt,
				lastModified: comment.props.lastModified,
				replies: comment.props.replies.map((reply) => ({
					id: reply.id,
					author: reply.author,
					message: reply.message,
					timestamp: reply.timestamp,
					mentions: reply.mentions.map((m) => ({
						type: m.type,
						id: m.id,
						displayName: m.displayName,
					})),
				})),
			}

			// Add bound shape info if present
			if (comment.props.boundShapeId) {
				detail.boundShapeId = comment.props.boundShapeId
				const boundShape = this.editor.getShape(comment.props.boundShapeId as TLShapeId)
				if (boundShape) {
					detail.boundShapeType = boundShape.type
				}
			}

			details.push(detail)
		}

		// Schedule data for next request
		agent.schedule({
			data: [
				`Comment details for ${details.length} comment(s):\n${JSON.stringify(details, null, 2)}`,
			],
		})
	}

	override savesToHistory(): boolean {
		return false
	}
}
