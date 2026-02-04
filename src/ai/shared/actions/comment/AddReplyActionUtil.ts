import { TLShapeId } from 'tldraw'
import z from 'zod'
import { AgentHelpers } from '../../AgentHelpers'
import { Streaming } from '../../types/Streaming'
import { AgentActionUtil } from '../AgentActionUtil'
import { Reply, Mention } from '../../../../tldraw/shapes/comment/CommentShape'
import { addReply } from '../../../../tldraw/shapes/comment/utils/comment-helpers'

const MentionSchema = z.object({
	type: z.enum(['shape', 'user', 'agent']),
	id: z.string(),
	displayName: z.string(),
	subtitle: z.string().optional(),
})

const ReplySchema = z.object({
	id: z.string(),
	author: z.string(),
	message: z.string(),
	timestamp: z.number(),
	parentReplyId: z.string().optional(),
	mentions: z.array(MentionSchema),
})

const AddReplyAction = z.object({
	_type: z.literal('add_reply'),
	commentId: z.string(),
	reply: ReplySchema,
})

type AddReplyAction = z.infer<typeof AddReplyAction>

export class AddReplyActionUtil extends AgentActionUtil<AddReplyAction> {
	static override type = 'add_reply' as const

	override getSchema() {
		return AddReplyAction
	}

	override getInfo(action: Streaming<AddReplyAction>) {
		const preview = action.reply?.message?.slice(0, 50) ?? ''
		return {
			icon: 'message-circle' as const,
			description: `Adding reply: ${preview}${preview.length >= 50 ? '...' : ''}`,
		}
	}

	override applyAction(action: Streaming<AddReplyAction>, helpers: AgentHelpers) {
		if (!action.complete) return
		if (!this.editor) return

		const { commentId, reply } = action

		// Build the Reply object
		const replyObj: Reply = {
			id: reply.id,
			author: reply.author,
			message: reply.message,
			timestamp: reply.timestamp,
			mentions: reply.mentions as Mention[],
		}

		if (reply.parentReplyId) {
			replyObj.parentReplyId = reply.parentReplyId
		}

		try {
			addReply(this.editor, commentId as TLShapeId, replyObj)
		} catch (error) {
			console.warn(`Failed to add reply to comment ${commentId}:`, error)
		}
	}
}
