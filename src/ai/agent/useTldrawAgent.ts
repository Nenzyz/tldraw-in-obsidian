import { useCallback, useMemo } from 'react'
import { Editor, useToasts } from 'tldraw'
import { TldrawAgent } from './TldrawAgent'
import { AISettings } from './streamAgent'
import { $agentsAtom } from './agentsAtom'

export interface UseTldrawAgentOptions {
	/** The editor to associate the agent with */
	editor: Editor
	/** A unique id for this agent instance */
	id?: string
	/** Function to get AI settings (API keys for all providers) */
	getSettings: () => AISettings
}

/**
 * Create a tldraw agent that can be prompted to edit the canvas.
 * The id is used to differentiate between multiple agents.
 *
 * The model is selected in the agent window (chat panel), not in settings.
 * Settings only provide API keys for each provider.
 *
 * @example
 * ```tsx
 * const agent = useTldrawAgent({
 *   editor,
 *   getSettings: () => ({
 *     providers: {
 *       anthropic: { apiKey: '...' },
 *       google: { apiKey: '...' },
 *       openai: { apiKey: '...' },
 *     }
 *   })
 * })
 * agent.prompt({ message: 'Draw a snowman' })
 * ```
 */
export function useTldrawAgent({ editor, id = 'tldraw-agent', getSettings }: UseTldrawAgentOptions): TldrawAgent {
	const toasts = useToasts()

	const handleError = useCallback(
		(e: any) => {
			const message = typeof e === 'string' ? e : e instanceof Error && e.message
			toasts.addToast({
				title: 'Error',
				description: message || 'An error occurred',
				severity: 'error',
			})
			console.error(e)
		},
		[toasts]
	)

	const agent = useMemo(() => {
		// Dispose an existing agent
		const existingAgent = $agentsAtom.get(editor).find((agent) => agent.id === id)
		if (existingAgent) {
			existingAgent.dispose()
		}

		// Create a new agent
		return new TldrawAgent({ editor, id, onError: handleError, getSettings })
	}, [editor, handleError, id, getSettings])

	return agent
}
