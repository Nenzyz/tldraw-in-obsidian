import { TLShapeId } from 'tldraw'
import z from 'zod'
import { AgentHelpers } from '../../AgentHelpers'
import { Streaming } from '../../types/Streaming'
import { AgentActionUtil } from '../AgentActionUtil'
import { TLCommentShape } from '../../../../tldraw/shapes/comment/CommentShape'
import {
	updateCommentStatus,
	bindCommentToShape,
	unbindComment,
} from '../../../../tldraw/shapes/comment/utils/comment-helpers'

const UpdateCommentAction = z.object({
	_type: z.literal('update_comment'),
	commentId: z.string(),
	updates: z.object({
		status: z.enum(['open', 'resolved']).optional(),
		boundShapeId: z.union([z.string(), z.null()]).optional(),
		position: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.optional(),
	}),
})

type UpdateCommentAction = z.infer<typeof UpdateCommentAction>

export class UpdateCommentActionUtil extends AgentActionUtil<UpdateCommentAction> {
	static override type = 'update_comment' as const

	override getSchema() {
		return UpdateCommentAction
	}

	override getInfo(action: Streaming<UpdateCommentAction>) {
		return {
			icon: 'message-circle' as const,
			description: 'Updating comment',
		}
	}

	override applyAction(action: Streaming<UpdateCommentAction>, helpers: AgentHelpers) {
		if (!action.complete) return
		if (!this.editor) return

		const { commentId, updates } = action
		const comment = this.editor.getShape<TLCommentShape>(commentId as TLShapeId)

		if (!comment || comment.type !== 'comment') {
			console.warn(`Comment not found: ${commentId}`)
			return
		}

		// Update status
		if (updates.status) {
			updateCommentStatus(this.editor, commentId as TLShapeId, updates.status)
		}

		// Handle binding changes
		if (updates.boundShapeId !== undefined) {
			if (updates.boundShapeId === null) {
				// Unbind comment
				unbindComment(this.editor, commentId as TLShapeId)
			} else {
				// Bind to new shape
				const targetShape = this.editor.getShape(updates.boundShapeId as TLShapeId)
				if (targetShape) {
					bindCommentToShape(this.editor, commentId as TLShapeId, updates.boundShapeId as TLShapeId)
				}
			}
		}

		// Update position (only for unbound comments)
		if (updates.position && !comment.props.boundShapeId) {
			this.editor.updateShape<TLCommentShape>({
				id: commentId as TLShapeId,
				type: 'comment',
				x: updates.position.x,
				y: updates.position.y,
			})
		}
	}
}
