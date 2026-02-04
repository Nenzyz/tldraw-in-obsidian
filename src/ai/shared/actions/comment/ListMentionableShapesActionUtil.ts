import z from 'zod'
import { AgentHelpers } from '../../AgentHelpers'
import { Streaming } from '../../types/Streaming'
import { AgentActionUtil } from '../AgentActionUtil'

const ListMentionableShapesAction = z.object({
	_type: z.literal('list_mentionable_shapes'),
})

type ListMentionableShapesAction = z.infer<typeof ListMentionableShapesAction>

interface MentionableShape {
	id: string
	displayName: string
	type: string
}

export class ListMentionableShapesActionUtil extends AgentActionUtil<ListMentionableShapesAction> {
	static override type = 'list_mentionable_shapes' as const

	override getSchema() {
		return ListMentionableShapesAction
	}

	override getInfo(action: Streaming<ListMentionableShapesAction>) {
		return {
			icon: 'list' as const,
			description: 'Listing mentionable shapes',
		}
	}

	override async applyAction(action: Streaming<ListMentionableShapesAction>, helpers: AgentHelpers) {
		if (!action.complete) return
		if (!this.editor) return

		const { agent } = helpers
		const shapes = this.editor.getCurrentPageShapes()
		const mentionableShapes: MentionableShape[] = []

		for (const shape of shapes) {
			// Skip comment shapes - they're not mentionable
			if (shape.type === 'comment') continue

			// Build display name from text content or type
			let displayName = shape.type
			const props = shape.props as any

			if (props.text) {
				displayName = props.text.slice(0, 30)
				if (props.text.length > 30) displayName += '...'
			} else if (props.richText) {
				// Extract text from rich text if available
				try {
					const richText = props.richText
					if (richText.content && Array.isArray(richText.content)) {
						const textContent = richText.content
							.map((block: any) => block.content?.map((c: any) => c.text || '').join('') || '')
							.join('')
						if (textContent) {
							displayName = textContent.slice(0, 30)
							if (textContent.length > 30) displayName += '...'
						}
					}
				} catch {
					// Fall back to type name
				}
			}

			mentionableShapes.push({
				id: shape.id,
				displayName,
				type: shape.type,
			})
		}

		// Schedule data for next request
		agent.schedule({
			data: [
				`Found ${mentionableShapes.length} mentionable shape(s):\n${JSON.stringify(mentionableShapes, null, 2)}`,
			],
		})
	}

	override savesToHistory(): boolean {
		return false
	}
}
