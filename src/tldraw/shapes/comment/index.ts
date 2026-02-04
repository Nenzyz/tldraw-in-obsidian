/**
 * Comment Shape Module
 *
 * Exports for the comment tracking collaboration feature.
 */

export { CommentShapeUtil } from './CommentShapeUtil';
export {
	type TLCommentShape,
	type TLCommentShapeProps,
	type Reply,
	type Mention,
	type CommentStatus,
	commentShapeProps,
	replyValidator,
	mentionValidator,
} from './CommentShape';
export {
	createComment,
	addReply,
	updateCommentStatus,
	getCommentReplies,
	extractMentions,
	updateLastModified,
	deleteComment,
	editReply,
	deleteReply,
	bindCommentToShape,
	unbindComment,
	getCommentsForShape,
} from './utils/comment-helpers';
