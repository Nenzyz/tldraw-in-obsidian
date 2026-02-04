import {
	BaseBoxShapeUtil,
	DefaultColorStyle,
	RecordProps,
	T,
	TLBaseShape,
	TLDefaultColorStyle,
} from 'tldraw';

/**
 * Mention type for references in comment replies
 */
export type Mention = {
	type: 'shape' | 'user' | 'agent';
	id: string;
	displayName: string;
	subtitle?: string; // Optional subtitle (e.g., shape text content)
};

/**
 * Reply structure for comment threads
 */
export type Reply = {
	id: string;
	author: string;
	message: string;
	timestamp: number;
	parentReplyId?: string;
	mentions: Mention[];
};

/**
 * Comment status enum
 */
export type CommentStatus = 'open' | 'resolved';

/**
 * Comment shape props interface
 */
export type TLCommentShapeProps = {
	author: string;
	createdAt: number;
	lastModified: number;
	status: CommentStatus;
	replies: Reply[];
	boundShapeId?: string;
	offset?: { x: number; y: number };
	w: number;
	h: number;
	color: TLDefaultColorStyle;
};

/**
 * Comment shape type extending base tldraw shape
 */
export type TLCommentShape = TLBaseShape<'comment', TLCommentShapeProps>;

/**
 * Validator schema for Mention
 */
export const mentionValidator = T.object({
	type: T.literalEnum('shape', 'user', 'agent'),
	id: T.string,
	displayName: T.string,
});

/**
 * Validator schema for Reply
 */
export const replyValidator = T.object({
	id: T.string,
	author: T.string,
	message: T.string,
	timestamp: T.number,
	parentReplyId: T.string.optional(),
	mentions: T.arrayOf(mentionValidator),
});

/**
 * Validator schema for CommentShape props
 */
export const commentShapeProps: RecordProps<TLCommentShape> = {
	author: T.string,
	createdAt: T.number,
	lastModified: T.number,
	status: T.literalEnum('open', 'resolved'),
	replies: T.arrayOf(replyValidator),
	boundShapeId: T.string.optional(),
	offset: T.object({
		x: T.number,
		y: T.number,
	}).optional(),
	w: T.number,
	h: T.number,
	color: DefaultColorStyle,
};
