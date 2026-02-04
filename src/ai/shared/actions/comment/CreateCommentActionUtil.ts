import { TLShapeId } from 'tldraw'
import z from 'zod'
import { AgentHelpers } from '../../AgentHelpers'
import { Streaming } from '../../types/Streaming'
import { AgentActionUtil } from '../AgentActionUtil'
import { createComment } from '../../../../tldraw/shapes/comment/utils/comment-helpers'

const CreateCommentAction = z.object({
	_type: z.literal('create_comment'),
	position: z.object({
		x: z.number(),
		y: z.number(),
	}),
	boundShapeId: z.string().optional(),
})

type CreateCommentAction = z.infer<typeof CreateCommentAction>

export class CreateCommentActionUtil extends AgentActionUtil<CreateCommentAction> {
	static override type = 'create_comment' as const

	override getSchema() {
		return CreateCommentAction
	}

	override getInfo(action: Streaming<CreateCommentAction>) {
		return {
			icon: 'message-circle' as const,
			description: 'Creating comment',
		}
	}

	override applyAction(action: Streaming<CreateCommentAction>, helpers: AgentHelpers) {
		if (!action.complete) return
		if (!this.editor) return

		const { position, boundShapeId } = action

		// Validate bound shape exists if provided
		let validBoundShapeId: string | undefined
		if (boundShapeId) {
			const shape = this.editor.getShape(boundShapeId as TLShapeId)
			if (shape) {
				validBoundShapeId = boundShapeId
			}
		}

		// Calculate offset if binding to a shape
		let offset: { x: number; y: number } | undefined
		if (validBoundShapeId) {
			const boundShape = this.editor.getShape(validBoundShapeId as TLShapeId)
			if (boundShape) {
				offset = {
					x: position.x - boundShape.x,
					y: position.y - boundShape.y,
				}
			}
		}

		createComment(this.editor, position, 'AI', {
			boundShapeId: validBoundShapeId,
			offset,
		})
	}
}
