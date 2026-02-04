import {
	Atom,
	atom,
	Box,
	Editor,
	react,
	RecordsDiff,
	reverseRecordsDiff,
	structuredClone,
	TLRecord,
	TLShapeId,
	Vec,
	VecModel,
	createShapeId,
} from 'tldraw'
import { AgentActionUtil } from '../shared/actions/AgentActionUtil'
import { AgentHelpers } from '../shared/AgentHelpers'
import { getAgentActionUtilsRecord, getPromptPartUtilsRecord } from '../shared/AgentUtils'
import { SimpleShape } from '../shared/format/SimpleShape'
import { PromptPartUtil } from '../shared/parts/PromptPartUtil'
import { AgentAction } from '../shared/types/AgentAction'
import { AgentInput } from '../shared/types/AgentInput'
import { AgentPrompt, BaseAgentPrompt } from '../shared/types/AgentPrompt'
import { AgentRequest } from '../shared/types/AgentRequest'
import { ChatHistoryItem } from '../shared/types/ChatHistoryItem'
import {
	AreaContextItem,
	ContextItem,
	PointContextItem,
	ShapeContextItem,
	ShapesContextItem,
} from '../shared/types/ContextItem'
import { PromptPart } from '../shared/types/PromptPart'
import { Streaming } from '../shared/types/Streaming'
import { TodoItem } from '../shared/types/TodoItem'
import { AgentModelName, DEFAULT_MODEL_NAME, getAgentModelDefinition } from '../models'
import { ProviderSessionState, CacheMetrics } from '../providers/types'
import { $agentsAtom } from './agentsAtom'
import { streamAgent, AISettings } from './streamAgent'
import type { TLCommentShape, Reply, Mention } from '../../tldraw/shapes/comment/CommentShape'
import { addReply } from '../../tldraw/shapes/comment/utils/comment-helpers'
import {
	getCommentsSince,
	getCommentsModifiedSince,
	getMentionsSince,
	getUnresolvedComments,
	buildDeltaSummary,
} from '../../tldraw/shapes/comment/utils/change-tracking'

export interface TldrawAgentOptions {
	/** The editor to associate the agent with. */
	editor: Editor
	/** A key used to differentiate the agent from other agents. */
	id: string
	/** A callback for when an error occurs. */
	onError: (e: any) => void
	/** Function to get AI settings (provider, model, API keys) */
	getSettings: () => AISettings
}

/**
 * An agent that can be prompted to edit the canvas.
 * Returned by the `useTldrawAgent` hook.
 *
 * @example
 * ```tsx
 * const agent = useTldrawAgent(editor)
 * agent.prompt({ message: 'Draw a snowman' })
 * ```
 */
export class TldrawAgent {
	/** The editor associated with this agent. */
	editor: Editor

	/** An id to differentiate the agent from other agents. */
	id: string

	/** A callback for when an error occurs. */
	onError: (e: any) => void

	/** Function to get AI settings (provider, model, API keys) */
	getSettings: () => AISettings

	/**
	 * An atom containing the currently active request.
	 * This is mainly used to render highlights and other UI elements.
	 */
	$activeRequest = atom<AgentRequest | null>('activeRequest', null)

	/**
	 * An atom containing the next request that the agent has scheduled for
	 * itself. Null if there is no scheduled request.
	 */
	$scheduledRequest = atom<AgentRequest | null>('scheduledRequest', null)

	/**
	 * An atom containing the agent's chat history.
	 */
	$chatHistory = atom<ChatHistoryItem[]>('chatHistory', [])

	/**
	 * An atom containing the position on the page where the current chat
	 * started.
	 */
	$chatOrigin = atom<VecModel>('chatOrigin', { x: 0, y: 0 })

	/**
	 * An atom containing the agent's todo list.
	 */
	$todoList = atom<TodoItem[]>('todoList', [])

	/**
	 * An atom that's used to store document changes made by the user since the
	 * previous request.
	 */
	$userActionHistory = atom<RecordsDiff<TLRecord>[]>('userActionHistory', [])

	/**
	 * An atom containing currently selected context items.
	 *
	 * To send context items to the model, include them in the `contextItems`
	 * field of a request.
	 */
	$contextItems = atom<ContextItem[]>('contextItems', [])

	/**
	 * An atom containing the model name that the user has selected. This gets
	 * passed through to prompts unless manually overridden.
	 *
	 * Note: Prompt part utils may ignore or override this value. See the
	 * ModelNamePartUtil for an example.
	 */
	$modelName = atom<AgentModelName>('modelName', DEFAULT_MODEL_NAME)

	/**
	 * An atom containing provider-specific session state for caching and
	 * conversation continuity.
	 *
	 * This state is ephemeral and is NOT persisted to localStorage.
	 * - Anthropic: Tracks whether cache was created (for logging/debugging)
	 * - OpenAI: Stores response ID for Responses API session continuity
	 *
	 * Cleared on agent.reset() to ensure clean state for new conversations.
	 */
	$providerSessionState = atom<ProviderSessionState>('providerSessionState', {})

	/**
	 * Create a new tldraw agent.
	 */
	constructor({ editor, id, onError, getSettings }: TldrawAgentOptions) {
		this.editor = editor
		this.id = id
		this.onError = onError
		this.getSettings = getSettings

		$agentsAtom.update(editor, (agents) => [...agents, this])

		this.agentActionUtils = getAgentActionUtilsRecord(this)
		this.promptPartUtils = getPromptPartUtilsRecord(this)
		this.unknownActionUtil = this.agentActionUtils.unknown

		persistAtomInLocalStorage(this.$chatHistory, `${id}:chat-history`)
		persistAtomInLocalStorage(this.$chatOrigin, `${id}:chat-origin`)
		persistAtomInLocalStorage(this.$modelName, `${id}:model-name`)
		persistAtomInLocalStorage(this.$todoList, `${id}:todo-items`)
		persistAtomInLocalStorage(this.$contextItems, `${id}:context-items`)
		// Note: $providerSessionState is intentionally NOT persisted
		// Sessions are ephemeral and should reset between Obsidian sessions

		this.stopRecordingFn = this.startRecordingUserActions()
	}

	/**
	 * Dispose of the agent by cancelling requests and stopping listeners.
	 */
	dispose() {
		this.cancel()
		this.stopRecordingUserActions()
		$agentsAtom.update(this.editor, (agents) => agents.filter((agent) => agent.id !== this.id))
	}

	/**
	 * Get an agent action util for a specific action type.
	 *
	 * @param type - The type of action to get the util for.
	 * @returns The action util.
	 */
	getAgentActionUtil(type?: string) {
		const utilType = this.getAgentActionUtilType(type)
		return this.agentActionUtils[utilType]
	}

	/**
	 * Get the util type for a provided action type.
	 * If no util type is found, returns 'unknown'.
	 */
	getAgentActionUtilType(type?: string) {
		if (!type) return 'unknown'
		const util = this.agentActionUtils[type as AgentAction['_type']]
		if (!util) return 'unknown'
		return type as AgentAction['_type']
	}

	/**
	 * Get a prompt part util for a specific part type.
	 *
	 * @param type - The type of part to get the util for.
	 * @returns The part util.
	 */
	getPromptPartUtil(type: PromptPart['type']) {
		return this.promptPartUtils[type]
	}

	/**
	 * A record of the agent's action util instances.
	 * Used by the `getAgentActionUtil` method.
	 */
	agentActionUtils: Record<AgentAction['_type'], AgentActionUtil<AgentAction>>

	/**
	 * The agent action util instance for the "unknown" action type.
	 *
	 * This is returned by the `getAgentActionUtil` method when the action type
	 * isn't properly specified. This can happen if the model isn't finished
	 * streaming yet or makes a mistake.
	 */
	unknownActionUtil: AgentActionUtil<AgentAction>

	/**
	 * A record of the agent's prompt part util instances.
	 * Used by the `getPromptPartUtil` method.
	 */
	promptPartUtils: Record<PromptPart['type'], PromptPartUtil<PromptPart>>

	/**
	 * Get a full agent request from a user input by filling out any missing
	 * values with defaults.
	 * @param input - A partial agent request or a string message.
	 */
	getFullRequestFromInput(input: AgentInput): AgentRequest {
		const request = this.getPartialRequestFromInput(input)

		const activeRequest = this.$activeRequest.get()
		return {
			type: request.type ?? 'user',
			messages: request.messages ?? [],
			data: request.data ?? [],
			selectedShapes: request.selectedShapes ?? [],
			contextItems: request.contextItems ?? [],
			bounds: request.bounds ?? activeRequest?.bounds ?? this.editor.getViewportPageBounds(),
			modelName: request.modelName ?? activeRequest?.modelName ?? this.$modelName.get(),
		}
	}

	/**
	 * Convert an input into a partial request.
	 * This involves handling the various ways that the input can be provided.
	 *
	 * @example
	 * ```tsx
	 * agent.prompt('Draw a cat')
	 * agent.prompt(['Draw a cat', 'Draw a dog'])
	 * agent.prompt({ messages: 'Draw a cat' })
	 * agent.prompt({ message: 'Draw a cat' })
	 * ```
	 *
	 * @param input - The input to get the request partial from.
	 * @returns The request partial.
	 */
	private getPartialRequestFromInput(input: AgentInput): Partial<AgentRequest> {
		// eg: agent.prompt('Draw a cat')
		if (typeof input === 'string') {
			return { messages: [input] }
		}

		// eg: agent.prompt(['Draw a cat', 'Draw a dog'])
		if (Array.isArray(input)) {
			return { messages: input }
		}

		// eg: agent.prompt({ messages: 'Draw a cat' })
		if (typeof input.messages === 'string') {
			return { ...input, messages: [input.messages] }
		}

		// eg: agent.prompt({ message: 'Draw a cat' })
		if (typeof input.message === 'string') {
			return { ...input, messages: [input.message, ...(input.messages ?? [])] }
		}

		return input
	}

	/**
	 * Get a full prompt based on a request.
	 *
	 * @param request - The request to use for the prompt.
	 * @param helpers - The helpers to use.
	 * @returns The fully assembled prompt.
	 */
	async preparePrompt(request: AgentRequest, helpers: AgentHelpers): Promise<AgentPrompt> {
		const { promptPartUtils } = this
		const transformedParts: PromptPart[] = []

		for (const util of Object.values(promptPartUtils)) {
			const part = await util.getPart(structuredClone(request), helpers)
			if (!part) continue
			transformedParts.push(part)
		}

		return Object.fromEntries(transformedParts.map((part) => [part.type, part])) as AgentPrompt
	}

	/**
	 * Prompt the agent to edit the canvas.
	 *
	 * @example
	 * ```tsx
	 * const agent = useTldrawAgent(editor)
	 * agent.prompt('Draw a cat')
	 * ```
	 *
	 * ```tsx
	 * agent.prompt({
	 *   message: 'Draw a cat in this area',
	 *   bounds: {
	 *     x: 0,
	 *     y: 0,
	 *     w: 300,
	 *     h: 400,
	 *   },
	 * })
	 * ```
	 *
	 * @returns A promise for when the agent has finished its work.
	 */
	async prompt(input: AgentInput) {
		const request = this.getFullRequestFromInput(input)

		// Submit the request to the agent.
		const { cancelled } = await this.request(request)

		// If the request was cancelled, don't continue
		if (cancelled) {
			return
		}

		// After the request is handled, check if there are any outstanding todo items or requests
		let scheduledRequest = this.$scheduledRequest.get()
		const todoItemsRemaining = this.$todoList.get().filter((item) => item.status !== 'done')

		if (!scheduledRequest) {
			// If there are no outstanding todo items, finish
			if (todoItemsRemaining.length === 0) {
				return
			}

			// If there are outstanding todo items, schedule a continuation request
			debugAgent('CONTINUE', `Found ${todoItemsRemaining.length} remaining todos, scheduling continuation`)
			scheduledRequest = {
				messages: request.messages,
				contextItems: request.contextItems,
				bounds: request.bounds,
				modelName: request.modelName,
				selectedShapes: request.selectedShapes,
				data: request.data,
				type: 'todo',
			}
		}

		// Add the scheduled request to chat history
		const resolvedData = await Promise.all(scheduledRequest.data)
		this.$chatHistory.update((prev) => [
			...prev,
			{
				type: 'continuation',
				data: resolvedData,
			},
		])

		// Handle the scheduled request
		this.$scheduledRequest.set(null)
		await this.prompt(scheduledRequest)
	}

	/**
	 * Send a single request to the agent and handle its response.
	 *
	 * Note: This method does not chain multiple requests together. For a full
	 * agentic system, use the `prompt` method.
	 *
	 * Most developers will not want to use this method directly. It's mostly
	 * used internally by the `prompt` method, but can also be useful for
	 * carrying out evals.
	 *
	 * @param input - The input to form the request from.
	 * @returns A promise for when the request is complete and a cancel function
	 * to abort the request.
	 */
	async request(input: AgentInput): Promise<{ cancelled: boolean }> {
		const request = this.getFullRequestFromInput(input)

		// Interrupt any currently active request
		if (this.$activeRequest.get() !== null) {
			this.cancel()
		}
		this.$activeRequest.set(request)

		// Call an external helper function to request the agent
		const { promise, cancel } = requestAgent({ agent: this, request })

		this.cancelFn = cancel
		promise.finally(() => {
			this.cancelFn = null
		})

		const result = await promise
		this.$activeRequest.set(null)
		return result
	}

	/**
	 * Schedule further work for the agent to do after this request has finished.
	 * What you schedule will get merged with the currently scheduled request, if there is one.
	 *
	 * @example
	 * ```tsx
	 * // Add an instruction
	 * agent.schedule('Add more detail.')
	 * ```
	 *
	 * @example
	 * ```tsx
	 * // Move the viewport
	 * agent.schedule({
	 *  bounds: { x: 0, y: 0, w: 100, h: 100 },
	 * })
	 * ```
	 *
	 * @example
	 * ```tsx
	 * // Add data to the request
	 * agent.schedule({ data: [value] })
	 * ```
	 */
	schedule(input: AgentInput) {
		const scheduledRequest = this.$scheduledRequest.get()

		// If there's no request scheduled yet, schedule one
		if (!scheduledRequest) {
			this.setScheduledRequest(input)
			return
		}

		const request = this.getPartialRequestFromInput(input)

		this.setScheduledRequest({
			type: 'schedule',

			// Append to properties where possible
			messages: [...scheduledRequest.messages, ...(request.messages ?? [])],
			contextItems: [...scheduledRequest.contextItems, ...(request.contextItems ?? [])],
			selectedShapes: [...scheduledRequest.selectedShapes, ...(request.selectedShapes ?? [])],
			data: [...scheduledRequest.data, ...(request.data ?? [])],

			// Override specific properties
			bounds: request.bounds ?? scheduledRequest.bounds,
			modelName: request.modelName ?? scheduledRequest.modelName,
		})
	}

	/**
	 * Manually override what the agent should do next.
	 *
	 * @example
	 * ```tsx
	 * agent.setScheduledRequest('Add more detail.')
	 * ```
	 *
	 * @example
	 * ```tsx
	 * agent.setScheduledRequest({
	 *  message: 'Add more detail to this area.',
	 *  bounds: { x: 0, y: 0, w: 100, h: 100 },
	 * })
	 * ```
	 *
	 * @example
	 * ```tsx
	 * // Cancel the scheduled request
	 * agent.setScheduledRequest(null)
	 * ```
	 *
	 * @param input - What to set the scheduled request to, or null to cancel
	 * the scheduled request.
	 */
	setScheduledRequest(input: AgentInput | null) {
		if (input === null) {
			this.$scheduledRequest.set(null)
			return
		}

		const request = this.getFullRequestFromInput(input)
		request.type = 'schedule'
		this.$scheduledRequest.set(request)
	}

	/**
	 * Add a todo item to the agent's todo list.
	 * @param text The text of the todo item.
	 * @returns The id of the todo item.
	 */
	addTodo(text: string) {
		const id = this.$todoList.get().length
		this.$todoList.update((todoItems) => {
			return [
				...todoItems,
				{
					id,
					status: 'todo' as const,
					text,
				},
			]
		})
		return id
	}

	/**
	 * Make the agent perform an action.
	 * @param action The action to make the agent do.
	 * @param helpers The helpers to use.
	 * @returns The diff of the action, and a promise for when the action is finished
	 */
	act(
		action: Streaming<AgentAction>,
		helpers = new AgentHelpers(this)
	): { diff: RecordsDiff<TLRecord>; promise: Promise<void> | null } {
		const { editor } = this
		const util = this.getAgentActionUtil(action._type)
		this.isActing = true

		let promise: Promise<void> | null = null
		let diff: RecordsDiff<TLRecord>
		try {
			diff = editor.store.extractingChanges(() => {
				promise = util.applyAction(structuredClone(action), helpers) ?? null
			})
		} finally {
			this.isActing = false
		}

		// Debug: log diff stats
		const diffStats = {
			added: Object.keys(diff.added).length,
			updated: Object.keys(diff.updated).length,
			removed: Object.keys(diff.removed).length,
		}
		console.warn(`🤖 [Agent:ACT] Action "${action._type}" diff:`, diffStats,
			'complete:', action.complete,
			'savesToHistory:', util.savesToHistory())

		// Add the action to chat history
		if (util.savesToHistory()) {
			const historyItem: ChatHistoryItem = {
				type: 'action',
				action,
				diff,
				acceptance: 'pending',
			}

			this.$chatHistory.update((historyItems) => {
				// If there are no items, start off the chat history with the first item
				if (historyItems.length === 0) return [historyItem]

				// If the last item is still in progress, replace it with the new item
				const lastHistoryItem = historyItems.at(-1)
				if (
					lastHistoryItem &&
					lastHistoryItem.type === 'action' &&
					!lastHistoryItem.action.complete
				) {
					return [...historyItems.slice(0, -1), historyItem]
				}

				// Otherwise, just add the new item to the end of the list
				return [...historyItems, historyItem]
			})
		}

		return { diff, promise }
	}

	/**
	 * A function that cancels the agent's current prompt, if one is active.
	 */
	private cancelFn: (() => void) | null = null

	/**
	 * Cancel the agent's current prompt, if one is active.
	 */
	cancel() {
		this.cancelFn?.()
		this.$activeRequest.set(null)
		this.$scheduledRequest.set(null)
		this.cancelFn = null
	}

	/**
	 * Reset the agent's chat and memory.
	 * Cancel the current request if there's one active.
	 */
	reset() {
		this.cancel()
		this.$contextItems.set([])
		this.$todoList.set([])
		this.$userActionHistory.set([])
		// Clear provider session state to ensure clean state for new conversations
		// This resets OpenAI response IDs and Anthropic cache tracking
		this.$providerSessionState.set({})

		const viewport = this.editor.getViewportPageBounds()
		this.$chatHistory.set([])
		this.$chatOrigin.set({ x: viewport.x, y: viewport.y })
	}

	/**
	 * Check if the agent is currently working on a request or not.
	 */
	isGenerating() {
		return this.$activeRequest.get() !== null
	}

	/**
	 * Whether the agent is currently acting on the editor or not.
	 * This flag is used to prevent agent actions from being recorded as user actions.
	 */
	private isActing = false

	/**
	 * Start recording user actions.
	 * @returns A cleanup function to stop recording user actions.
	 */
	private startRecordingUserActions() {
		const { editor } = this
		const cleanUpCreate = editor.sideEffects.registerAfterCreateHandler(
			'shape',
			(shape, source) => {
				if (source !== 'user') return
				if (this.isActing) return
				const change = {
					added: { [shape.id]: shape },
					updated: {},
					removed: {},
				}
				this.$userActionHistory.update((prev) => [...prev, change])
				return
			}
		)

		const cleanUpDelete = editor.sideEffects.registerAfterDeleteHandler(
			'shape',
			(shape, source) => {
				if (source !== 'user') return
				if (this.isActing) return
				const change = {
					added: {},
					updated: {},
					removed: { [shape.id]: shape },
				}
				this.$userActionHistory.update((prev) => [...prev, change])
				return
			}
		)

		const cleanUpChange = editor.sideEffects.registerAfterChangeHandler(
			'shape',
			(prev, next, source) => {
				if (source !== 'user') return
				if (this.isActing) return
				const change: RecordsDiff<TLRecord> = {
					added: {},
					updated: { [prev.id]: [prev, next] },
					removed: {},
				}
				this.$userActionHistory.update((prev) => [...prev, change])
				return
			}
		)

		function cleanUp() {
			cleanUpCreate()
			cleanUpDelete()
			cleanUpChange()
		}

		return cleanUp
	}

	/**
	 * A function that stops recording user actions.
	 */
	private stopRecordingFn: () => void

	/**
	 * Stop recording user actions.
	 */
	private stopRecordingUserActions() {
		this.stopRecordingFn?.()
	}

	/**
	 * Add a context item to the agent's context, ensuring that duplicates are
	 * not included.
	 *
	 * @param item The context item to add.
	 */
	addToContext(item: ContextItem) {
		this.$contextItems.update((items) => {
			// Don't add shapes that are already within context
			if (item.type === 'shapes') {
				const newItems = dedupeShapesContextItem(item, items)
				return [...items, ...newItems]
			}

			// Don't add items that are already in context
			if (this.hasContextItem(item)) {
				return items
			}

			return [...items, structuredClone(item)]
		})
	}

	/**
	 * Remove a context item from the agent's context.
	 * @param item The context item to remove.
	 */
	removeFromContext(item: ContextItem) {
		this.$contextItems.update((items) => items.filter((v) => item !== v))
	}

	/**
	 * Check if the agent's context contains a specific context item. This could
	 * mean as an individual item, or as part of a group of items.
	 *
	 * @param item The context item to check for.
	 * @returns True if the agent's context contains the item, false otherwise.
	 */
	hasContextItem(item: ContextItem) {
		const items = this.$contextItems.get()
		if (items.some((v) => areContextItemsEqual(v, item))) {
			return true
		}

		if (item.type === 'shape') {
			for (const existingItem of items) {
				if (existingItem.type === 'shapes') {
					if (existingItem.shapes.some((shape) => shape.shapeId === item.shape.shapeId)) {
						return true
					}
				}
			}
		}

		return false
	}

	// ==================== Comment Integration Methods ====================

	/**
	 * Create a comment shape on the canvas.
	 * The comment is authored by the AI agent ("AI").
	 *
	 * @param position - Canvas position for the comment
	 * @param message - Initial message/content for the comment
	 * @param boundShapeId - Optional shape ID to bind the comment to
	 * @returns The ID of the created comment shape
	 *
	 * @example
	 * ```tsx
	 * // Create free-floating comment
	 * agent.createComment({ x: 100, y: 200 }, 'This needs work')
	 *
	 * // Create comment bound to a shape
	 * agent.createComment({ x: 100, y: 200 }, 'Fix this shape', shapeId)
	 * ```
	 */
	createComment(
		position: { x: number; y: number },
		message: string,
		boundShapeId?: TLShapeId
	): TLShapeId {
		const id = createShapeId()
		const now = Date.now()

		// Calculate offset if binding to a shape
		let offset: { x: number; y: number } | undefined
		if (boundShapeId) {
			const targetShape = this.editor.getShape(boundShapeId)
			if (targetShape) {
				offset = {
					x: position.x - targetShape.x,
					y: position.y - targetShape.y,
				}
			}
		}

		// Create the comment shape with initial reply from AI
		const initialReply: Reply = {
			id: 'reply-' + now + '-' + Math.random().toString(36).substring(2, 9),
			author: 'AI',
			message,
			timestamp: now,
			mentions: [],
		}

		this.editor.createShape<TLCommentShape>({
			id,
			type: 'comment',
			x: position.x,
			y: position.y,
			props: {
				author: 'AI',
				createdAt: now,
				lastModified: now,
				status: 'open',
				replies: [initialReply],
				boundShapeId,
				offset,
				w: 32,
				h: 32,
				color: 'black',
			},
		})

		return id
	}

	/**
	 * Add a reply to an existing comment.
	 * The reply is authored by the AI agent ("AI").
	 *
	 * @param commentId - ID of the comment shape
	 * @param message - Reply message text
	 * @param mentions - Optional array of mentions to include in the reply
	 *
	 * @example
	 * ```tsx
	 * // Add simple reply
	 * agent.addCommentReply(commentId, 'I can help with that!')
	 *
	 * // Add reply with mentions
	 * agent.addCommentReply(commentId, 'Check out @Shape1', [mention])
	 * ```
	 */
	addCommentReply(
		commentId: TLShapeId,
		message: string,
		mentions: Mention[] = []
	): void {
		const reply: Reply = {
			id: 'reply-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
			author: 'AI',
			message,
			timestamp: Date.now(),
			mentions,
		}

		addReply(this.editor, commentId, reply)
	}

	/**
	 * Respond to a specific reply in a comment thread.
	 * This is a convenience method for adding a reply that references another reply.
	 *
	 * @param commentId - ID of the comment shape
	 * @param replyId - ID of the reply being responded to
	 * @param message - Response message text
	 *
	 * @example
	 * ```tsx
	 * agent.respondToMention(commentId, replyId, 'I agree with that point!')
	 * ```
	 */
	respondToMention(
		commentId: TLShapeId,
		replyId: string,
		message: string
	): void {
		const reply: Reply = {
			id: 'reply-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
			author: 'AI',
			message,
			timestamp: Date.now(),
			parentReplyId: replyId,
			mentions: [],
		}

		addReply(this.editor, commentId, reply)
	}

	/**
	 * Get all mentions in a specific comment's replies.
	 *
	 * @param commentId - ID of the comment shape
	 * @returns Array of all mentions found in the comment's replies
	 *
	 * @example
	 * ```tsx
	 * const mentions = agent.getMentionsInComment(commentId)
	 * const aiMentions = mentions.filter(m => m.type === 'agent' && m.id === 'AI')
	 * ```
	 */
	getMentionsInComment(commentId: TLShapeId): Mention[] {
		const comment = this.editor.getShape<TLCommentShape>(commentId)
		if (!comment || comment.type !== 'comment') {
			return []
		}

		const allMentions: Mention[] = []
		for (const reply of comment.props.replies) {
			allMentions.push(...reply.mentions)
		}

		return allMentions
	}

	/**
	 * Get all comments on the canvas that contain @AI mentions.
	 *
	 * @returns Array of comment shapes that have @AI mentions in their replies
	 *
	 * @example
	 * ```tsx
	 * const mentionedComments = agent.getCommentsWithAIMentions()
	 * for (const comment of mentionedComments) {
	 *   agent.addCommentReply(comment.id, 'I saw your mention!')
	 * }
	 * ```
	 */
	getCommentsWithAIMentions(): TLCommentShape[] {
		const allShapes = this.editor.getCurrentPageShapes()
		const commentsWithAIMentions: TLCommentShape[] = []

		for (const shape of allShapes) {
			if (shape.type === 'comment') {
				const comment = shape as TLCommentShape
				const mentions = this.getMentionsInComment(comment.id)
				const hasAIMention = mentions.some(
					(m) => m.type === 'agent' && m.id === 'AI'
				)
				if (hasAIMention) {
					commentsWithAIMentions.push(comment)
				}
			}
		}

		return commentsWithAIMentions
	}

	// ==================== Comment Change Tracking Methods ====================

	/**
	 * Get all comments created after a given timestamp.
	 * This is a convenience method that wraps the change-tracking utility.
	 *
	 * @param timestamp - Unix milliseconds timestamp
	 * @returns Array of comment shapes created after timestamp
	 *
	 * @example
	 * ```tsx
	 * const lastCheck = agent.getLastCheckedTimestamp()
	 * const newComments = agent.getCommentsSince(lastCheck)
	 * ```
	 */
	getCommentsSince(timestamp: number): TLCommentShape[] {
		return getCommentsSince(this.editor, timestamp)
	}

	/**
	 * Get all comments modified (new replies added) after a given timestamp.
	 * This is a convenience method that wraps the change-tracking utility.
	 *
	 * @param timestamp - Unix milliseconds timestamp
	 * @returns Array of comment shapes modified after timestamp
	 *
	 * @example
	 * ```tsx
	 * const lastCheck = agent.getLastCheckedTimestamp()
	 * const modifiedComments = agent.getCommentsModifiedSince(lastCheck)
	 * ```
	 */
	getCommentsModifiedSince(timestamp: number): TLCommentShape[] {
		return getCommentsModifiedSince(this.editor, timestamp)
	}

	/**
	 * Get all @AI mentions after a given timestamp.
	 * This is a convenience method that wraps the change-tracking utility.
	 *
	 * @param timestamp - Unix milliseconds timestamp
	 * @returns Array of results containing comments and replies with @AI mentions
	 *
	 * @example
	 * ```tsx
	 * const lastCheck = agent.getLastCheckedTimestamp()
	 * const mentions = agent.getMentionsSince(lastCheck)
	 * for (const { comment, replies } of mentions) {
	 *   agent.addCommentReply(comment.id, 'Thanks for mentioning me!')
	 * }
	 * ```
	 */
	getMentionsSince(timestamp: number) {
		return getMentionsSince(this.editor, timestamp, 'AI')
	}

	/**
	 * Get all unresolved (open status) comments.
	 * This is a convenience method that wraps the change-tracking utility.
	 *
	 * @returns Array of unresolved comment shapes
	 *
	 * @example
	 * ```tsx
	 * const unresolvedComments = agent.getUnresolvedComments()
	 * console.log(`${unresolvedComments.length} comments need attention`)
	 * ```
	 */
	getUnresolvedComments(): TLCommentShape[] {
		return getUnresolvedComments(this.editor)
	}

	/**
	 * Build a delta summary of comment activity since the last check.
	 * This provides a human-readable summary for agent context.
	 *
	 * @param lastCheckedTimestamp - Unix milliseconds timestamp of last check
	 * @returns Formatted summary string with counts and highlights
	 *
	 * @example
	 * ```tsx
	 * const lastCheck = agent.getLastCheckedTimestamp()
	 * const summary = agent.buildDeltaSummary(lastCheck)
	 * // "Since last check: 3 new comments, 5 new replies, 2 @AI mentions\n..."
	 * ```
	 */
	buildDeltaSummary(lastCheckedTimestamp: number): string {
		return buildDeltaSummary(this.editor, lastCheckedTimestamp)
	}

	/**
	 * Update provider session state after a successful request.
	 * This method is called by requestAgent to persist session metadata.
	 *
	 * @param provider - The provider that was used (anthropic, openai, google)
	 * @param metadata - Session metadata from the final StreamAction
	 */
	updateProviderSessionState(
		provider: 'anthropic' | 'openai' | 'google',
		metadata: { responseId?: string; cacheMetrics?: CacheMetrics }
	) {
		if (provider === 'openai' && metadata.responseId) {
			debugSession('UPDATE', 'Storing OpenAI responseId', { responseId: metadata.responseId })
			this.$providerSessionState.update((state) => ({
				...state,
				openai: { responseId: metadata.responseId! }
			}))
		}

		if (provider === 'anthropic' && metadata.cacheMetrics) {
			const cacheCreated = metadata.cacheMetrics.created > 0
			debugSession('UPDATE', 'Storing Anthropic cache state', {
				cacheCreated,
				created: metadata.cacheMetrics.created,
				read: metadata.cacheMetrics.read
			})
			this.$providerSessionState.update((state) => ({
				...state,
				anthropic: { cacheCreated }
			}))
		}

		// Log OpenAI cache metrics (auto-caching for prompts 1024+ tokens)
		if (provider === 'openai' && metadata.cacheMetrics) {
			debugSession('UPDATE', 'OpenAI cache metrics', {
				read: metadata.cacheMetrics.read
			})
		}
	}
}

/**
 * Send a request to the agent and handle its response.
 *
 * This is a helper function that is used internally by the agent.
 */
// Debug logging for agent flow
const DEBUG_AGENT = true
function debugAgent(stage: string, ...args: unknown[]) {
	if (DEBUG_AGENT) {
		console.warn(`🤖 [Agent:${stage}]`, ...args)
	}
}

// Debug logging for session state management
const DEBUG_SESSION = true
function debugSession(stage: string, ...args: unknown[]) {
	if (DEBUG_SESSION) {
		console.warn(`🤖 [Agent:SESSION:${stage}]`, ...args)
	}
}

function requestAgent({ agent, request }: { agent: TldrawAgent; request: AgentRequest }): { promise: Promise<{ cancelled: boolean }>; cancel: () => void } {
	const { editor } = agent
	debugAgent('REQUEST', 'Starting request', { type: request.type, messageCount: request.messages.length })

	// If the request is from the user, add it to chat history
	if (request.type === 'user') {
		const promptHistoryItem: ChatHistoryItem = {
			type: 'prompt',
			message: request.messages.join('\n'),
			contextItems: request.contextItems,
			selectedShapes: request.selectedShapes,
		}
		agent.$chatHistory.update((prev) => [...prev, promptHistoryItem])
		debugAgent('REQUEST', 'Added prompt to chat history')
	}

	let cancelled = false
	const controller = new AbortController()
	const signal = controller.signal
	const helpers = new AgentHelpers(agent)

	const requestPromise = (async (): Promise<{ cancelled: boolean }> => {
		const baseSettings = agent.getSettings()
		// Get the friendly model name from the agent's model selector (in agent window)
		const modelName = request.modelName ?? agent.$modelName.get()

		// Get the provider for this model to determine which session state to use
		let provider: 'anthropic' | 'openai' | 'google' = 'anthropic'
		try {
			provider = getAgentModelDefinition(modelName).provider
		} catch {
			// If model not found, default to anthropic
			debugAgent('REQUEST', 'Could not determine provider for model, defaulting to anthropic')
		}

		// Include provider session state in settings for session continuity
		const providerSessionState = agent.$providerSessionState.get()
		const settings: AISettings = {
			...baseSettings,
			providerSessionState,
		}

		debugSession('REQUEST', 'Passing session state to stream', {
			provider,
			hasOpenAISession: !!providerSessionState.openai?.responseId,
			hasAnthropicCache: !!providerSessionState.anthropic?.cacheCreated
		})

		debugAgent('REQUEST', 'Preparing prompt...')
		const prompt = await agent.preparePrompt(request, helpers)
		debugAgent('REQUEST', 'Prompt prepared, starting stream')
		debugAgent('REQUEST', `Using model: ${modelName}`)
		let incompleteDiff: RecordsDiff<TLRecord> | null = null
		const actionPromises: Promise<void>[] = []
		let actionIndex = 0

		// Track session metadata from final action
		let lastResponseId: string | undefined
		let lastCacheMetrics: CacheMetrics | undefined

		try {
			for await (const action of streamAgent({ prompt, signal, modelName, settings })) {
				if (cancelled) {
					debugAgent('APPLY', 'Cancelled, breaking loop')
					break
				}
				actionIndex++
				debugAgent('APPLY', `Processing action ${actionIndex}:`, action._type, action.complete ? '(complete)' : '(streaming)')

				// Extract session metadata from complete actions
				if (action.complete) {
					const actionWithMeta = action as typeof action & { responseId?: string; cacheMetrics?: { created: number; read: number } }
					if (actionWithMeta.responseId) {
						lastResponseId = actionWithMeta.responseId
						debugSession('EXTRACT', 'Found responseId in action', { responseId: lastResponseId })
					}
					if (actionWithMeta.cacheMetrics) {
						lastCacheMetrics = actionWithMeta.cacheMetrics
						debugSession('EXTRACT', 'Found cacheMetrics in action', lastCacheMetrics)
					}
				}

				editor.run(
					() => {
						const actionUtil = agent.getAgentActionUtil(action._type)

						// helpers the agent's action
						const transformedAction = actionUtil.sanitizeAction(action, helpers)
						if (!transformedAction) {
							debugAgent('APPLY', 'Action sanitized to null, skipping')
							incompleteDiff = null
							return
						}

						// If there was a diff from an incomplete action, revert it so that we can reapply the action
						if (incompleteDiff) {
							debugAgent('APPLY', 'Reverting incomplete diff before reapply')
							const inversePrevDiff = reverseRecordsDiff(incompleteDiff)
							editor.store.applyDiff(inversePrevDiff)
						}

						// Apply the action to the app and editor
						debugAgent('APPLY', 'Applying action to editor...')
						const { diff, promise } = agent.act(transformedAction, helpers)
						debugAgent('APPLY', 'Action applied', { hasDiff: !!diff, hasPromise: !!promise })

						if (promise) {
							actionPromises.push(promise)
						}

						// The the action is incomplete, save the diff so that we can revert it in the future
						if (transformedAction.complete) {
							incompleteDiff = null
						} else {
							incompleteDiff = diff
						}
					},
					{
						ignoreShapeLock: false,
						history: 'ignore',
					}
				)
			}
			debugAgent('APPLY', `Stream ended. Waiting for ${actionPromises.length} async promises...`)
			await Promise.all(actionPromises)
			debugAgent('APPLY', 'All promises resolved. Request complete.')

			// Update provider session state with extracted metadata
			if (lastResponseId || lastCacheMetrics) {
				agent.updateProviderSessionState(provider, {
					responseId: lastResponseId,
					cacheMetrics: lastCacheMetrics
				})
			}

			return { cancelled }
		} catch (e) {
			if (e === 'Cancelled by user' || (e instanceof Error && e.name === 'AbortError')) {
				debugAgent('APPLY', 'Request cancelled')
				return { cancelled: true }
			}
			debugAgent('APPLY', 'ERROR:', e)
			agent.onError(e)
			return { cancelled: false }
		}
	})()

	const cancel = () => {
		cancelled = true
		controller.abort('Cancelled by user')
	}

	return { promise: requestPromise, cancel }
}

/**
 * Check if two context items are equal.
 *
 * This is a helper function that is used internally by the agent.
 */
function areContextItemsEqual(a: ContextItem, b: ContextItem): boolean {
	if (a.type !== b.type) return false

	switch (a.type) {
		case 'shape': {
			const _b = b as ShapeContextItem
			return a.shape.shapeId === _b.shape.shapeId
		}
		case 'shapes': {
			const _b = b as ShapesContextItem
			if (a.shapes.length !== _b.shapes.length) return false
			return a.shapes.every((shape) => _b.shapes.find((s) => s.shapeId === shape.shapeId))
		}
		case 'area': {
			const _b = b as AreaContextItem
			return Box.Equals(a.bounds, _b.bounds)
		}
		case 'point': {
			const _b = b as PointContextItem
			return Vec.Equals(a.point, _b.point)
		}
		default: {
			exhaustiveSwitchError(a)
		}
	}
}

/**
 * Remove duplicate shapes from a shapes context item.
 * If there's only one shape left, return it as a shape item instead.
 *
 * This is a helper function that is used internally by the agent.
 */
function dedupeShapesContextItem(
	item: ShapesContextItem,
	existingItems: ContextItem[]
): ContextItem[] {
	// Get all shape IDs that are already in the context
	const existingShapeIds = new Set<string>()

	// Check individual shapes
	existingItems.forEach((contextItem) => {
		if (contextItem.type === 'shape') {
			existingShapeIds.add(contextItem.shape.shapeId)
		} else if (contextItem.type === 'shapes') {
			contextItem.shapes.forEach((shape: SimpleShape) => {
				existingShapeIds.add(shape.shapeId)
			})
		}
	})

	// Filter out shapes that are already in the context
	const newShapes = item.shapes.filter((shape) => !existingShapeIds.has(shape.shapeId))

	// Only add if there are remaining shapes
	if (newShapes.length > 0) {
		// If only one shape remains, add it as a single shape item
		if (newShapes.length === 1) {
			const newItem: ContextItem = {
				type: 'shape',
				shape: newShapes[0],
				source: item.source,
			}
			return [structuredClone(newItem)]
		}

		// Otherwise add as a shapes group
		const newItem: ContextItem = {
			type: 'shapes',
			shapes: newShapes,
			source: item.source,
		}
		return [structuredClone(newItem)]
	}

	// No new shapes to add
	return []
}

/**
 * Load an atom's value from local storage and persist it to local storage whenever it changes.
 *
 * This is a helper function that is used internally by the agent.
 */
function persistAtomInLocalStorage<T>(atom: Atom<T>, key: string) {
	const localStorage = globalThis.localStorage
	if (!localStorage) return

	try {
		const stored = localStorage.getItem(key)
		if (stored) {
			const value = JSON.parse(stored) as T
			atom.set(value)
		}
	} catch {
		console.warn(`Couldn't load ${key} from localStorage`)
	}

	react(`save ${key} to localStorage`, () => {
		localStorage.setItem(key, JSON.stringify(atom.get()))
	})
}

/**
 * Throw an error if a switch case is not exhaustive.
 *
 * This is a helper function that is used internally by the agent.
 */
function exhaustiveSwitchError(value: never, property?: string): never {
	const debugValue =
		property && value && typeof value === 'object' && property in value ? value[property] : value
	throw new Error(`Unknown switch case ${debugValue}`)
}
