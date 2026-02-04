/**
 * Comment Creation Tool (Task Group 3)
 *
 * Custom tldraw tool for placing comment markers on the canvas.
 * Supports both free-floating comments and bound comments (attached to shapes).
 *
 * States:
 * - Idle: Waiting for user interaction
 * - Pointing: User has clicked, tracking pointer for binding detection
 * - Complete: Comment created, transitioning back to select mode
 *
 * Features:
 * - Hover detection to identify target shapes for binding
 * - Visual feedback when hovering over bindable shapes
 * - Automatic binding when clicking on a shape
 * - Free-floating comment creation when clicking on empty canvas
 * - Current user attribution from plugin settings
 */

import { StateNode, VecModel, TLShape, TLShapeId } from 'tldraw';
import { createComment } from '../shapes/comment/utils/comment-helpers';

export class CommentTool extends StateNode {
	static override id = 'comment';
	static override initial = 'idle';
	static override children() {
		return [CommentIdle, CommentPointing, CommentComplete];
	}

	override isLockable = false;

	override onEnter() {
		this.editor.setCursor({ type: 'cross', rotation: 0 });
	}

	override onExit() {
		this.editor.setCursor({ type: 'default', rotation: 0 });
	}

	override onInterrupt() {
		this.complete();
	}

	override onCancel() {
		this.complete();
	}

	private complete() {
		this.parent.transition('select', {});
	}
}

class CommentIdle extends StateNode {
	static override id = 'idle';

	override onPointerDown() {
		this.parent.transition('pointing');
	}
}

class CommentPointing extends StateNode {
	static override id = 'pointing';

	private initialPagePoint: VecModel | undefined = undefined;
	private hoveredShapeId: TLShapeId | undefined = undefined;

	override onEnter() {
		this.initialPagePoint = this.editor.inputs.currentPagePoint.clone();
		this.hoveredShapeId = this.detectShapeAtPointer();
	}

	override onPointerMove() {
		// Update hovered shape for visual feedback
		this.hoveredShapeId = this.detectShapeAtPointer();

		// Visual feedback would be rendered by an overlay component
		// listening to the tool state (similar to arrow binding hints)
	}

	override onPointerUp() {
		if (!this.initialPagePoint) return;

		const currentPagePoint = this.editor.inputs.currentPagePoint;

		// Get current user from editor context
		// In real implementation, this would come from plugin settings
		const currentUser = this.getCurrentUser();

		// Determine if we should bind to a shape
		const targetShapeId = this.detectShapeAtPointer();

		if (targetShapeId) {
			// Create bound comment
			const targetShape = this.editor.getShape(targetShapeId);
			if (targetShape) {
				const offset = {
					x: currentPagePoint.x - targetShape.x,
					y: currentPagePoint.y - targetShape.y,
				};

				createComment(this.editor, currentPagePoint, currentUser, {
					boundShapeId: targetShapeId,
					offset,
				});
			}
		} else {
			// Create free-floating comment
			createComment(this.editor, currentPagePoint, currentUser);
		}

		// Transition to complete state, which will return to select mode
		this.parent.transition('complete');
	}

	/**
	 * Detect if the pointer is currently over a shape
	 * @returns The shape ID if hovering over a shape, undefined otherwise
	 */
	private detectShapeAtPointer(): TLShapeId | undefined {
		const currentPagePoint = this.editor.inputs.currentPagePoint;

		// Get shape at the current pointer position
		const shapeAtPoint = this.editor.getShapeAtPoint(currentPagePoint, {
			hitInside: true,
			hitFrameInside: false,
			margin: 0,
			renderingOnly: false,
		});

		// Don't bind to comment shapes (avoid comment-to-comment binding)
		if (shapeAtPoint && shapeAtPoint.type !== 'comment') {
			return shapeAtPoint.id;
		}

		return undefined;
	}

	/**
	 * Get the current user from plugin settings or editor context
	 * @returns The current user's name/ID
	 */
	private getCurrentUser(): string {
		// Try to get user from test context first (for testing)
		if ((this.editor as any)._testCurrentUser) {
			return (this.editor as any)._testCurrentUser;
		}

		// In production, get user from plugin settings stored in editor
		// This would be set when the editor is initialized with plugin context
		const pluginSettings = (this.editor as any)._pluginSettings;
		if (pluginSettings?.username) {
			return pluginSettings.username;
		}

		// Default fallback
		return 'User';
	}
}

class CommentComplete extends StateNode {
	static override id = 'complete';

	override onEnter() {
		// Immediately transition back to select mode
		this.editor.setCurrentTool('select');
	}
}
