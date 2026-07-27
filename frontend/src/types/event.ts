export enum EventType {
  COMMENT_CREATED = "COMMENT_CREATED",
  COMMENT_UPDATED = "COMMENT_UPDATED",
  COMMENT_DELETED = "COMMENT_DELETED",
  COMMENT_LIKED = "COMMENT_LIKED",
  COMMENT_UNLIKED = "COMMENT_UNLIKED",
}

export interface CommentCreatedPayload {
  commentId: string;
  parentId: string | null;
  authorId: string;
  authorUsername: string;
  message: string;
}

export interface CommentUpdatedPayload {
  commentId: string;
  message: string;
  editedAt: string;
}

export interface CommentDeletedPayload {
  commentId: string;
}

export interface CommentLikedPayload {
  commentId: string;
  userId: string;
  likes: number;
}

export interface CommentUnlikedPayload {
  commentId: string;
  userId: string;
  likes: number;
}

export type EventPayload =
  | CommentCreatedPayload
  | CommentUpdatedPayload
  | CommentDeletedPayload
  | CommentLikedPayload
  | CommentUnlikedPayload;

export interface BroadcastEnvelope {
  eventId: number;
  type: EventType;
  payload: EventPayload;
}

export interface SyncCompletePayload {
  latestEventId: number;
}

export interface SocketErrorPayload {
  message: string;
}
