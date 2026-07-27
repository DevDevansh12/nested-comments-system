import { Types } from "mongoose";

// ─── Event type catalogue ──────────────────────────────────────────────────────

/**
 * Every mutation in the system is recorded as an event.
 * Using a string enum (rather than numeric codes) keeps the event log
 * human-readable and makes it safe to add new types without re-numbering.
 */
export enum EventType {
  COMMENT_CREATED = "COMMENT_CREATED",
  COMMENT_UPDATED = "COMMENT_UPDATED",
  COMMENT_DELETED = "COMMENT_DELETED",
  COMMENT_LIKED   = "COMMENT_LIKED",
  COMMENT_UNLIKED = "COMMENT_UNLIKED",
}

// ─── Payload shapes per event type ────────────────────────────────────────────
// Keeping typed payloads here makes it safe to read events in the WebSocket
// layer later without casting blind.

export interface CommentCreatedPayload {
  commentId: string;   // UUID
  parentId: string | null;
  authorId: string;
  authorUsername: string;
  message: string;
}

export interface CommentUpdatedPayload {
  commentId: string;
  message: string;
  editedAt: Date;
}

export interface CommentDeletedPayload {
  commentId: string;
}

export interface CommentLikedPayload {
  commentId: string;
  userId: string;
  likes: number; // new aggregate count after the action
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

// ─── Full document interface ───────────────────────────────────────────────────

export interface IEvent {
  _id: Types.ObjectId;

  /**
   * Monotonically increasing integer — the backbone of the sync protocol.
   * Clients send their last-seen eventId; the server returns all events
   * with eventId > that value, letting them catch up incrementally.
   */
  eventId: number;

  type: EventType;

  /** UUID of the comment this event concerns */
  commentId: string;

  /**
   * Typed payload stored as Mixed (schema-less) so we can evolve payload
   * shapes without migrations. Validated at the service layer via TypeScript.
   */
  payload: EventPayload;

  createdAt: Date;
}

// ─── Service DTOs ──────────────────────────────────────────────────────────────

export interface CreateEventDto {
  type: EventType;
  commentId: string;
  payload: EventPayload;
}
