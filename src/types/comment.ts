import { Types } from "mongoose";

// ─── Embedded sub-document ────────────────────────────────────────────────────

/**
 * Snapshot of the author stored directly on the comment document.
 * We denormalise username so a single comment read never requires
 * a JOIN-equivalent populate() call. The trade-off is that a username
 * change requires updating all comment documents — acceptable here because
 * usernames are typically immutable in comment systems.
 */
export interface ICommentAuthor {
  /** UUID of the user (matches User.id, not User._id) */
  id: string;
  username: string;
}

// ─── Full document ─────────────────────────────────────────────────────────────

/**
 * The complete shape of a Comment as stored in MongoDB.
 * Extends Mongoose Document so it carries the Mongoose instance methods.
 *
 * Note: `_id` is the internal ObjectId used by MongoDB for storage and
 * indexing. `id` is the public UUID exposed to clients and other services.
 */
export interface IComment {
  _id: Types.ObjectId;

  /** Public UUID v4 — the identity used in all API requests and WebSocket events */
  id: string;

  /**
   * UUID of the parent comment, or null for a top-level comment.
   * Storing this (rather than a path array or nested subdocs) gives O(1)
   * parent lookup and simple recursive client-side tree construction.
   */
  parentId: string | null;

  author: ICommentAuthor;
  message: string;

  /** Aggregate like count — denormalised for fast reads */
  likes: number;

  /** Set of user UUIDs who have liked this comment — prevents duplicate likes */
  likedBy: string[];

  /**
   * Soft-delete flag. Deleted comments are kept in the DB so children
   * can still reference their parentId and the thread stays intact.
   * The message is replaced with a placeholder on the read path.
   */
  isDeleted: boolean;

  createdAt: Date;
  updatedAt: Date;

  /** Null until the first edit — lets the client show an "edited" badge */
  editedAt: Date | null;

  /**
   * Monotonic event ID of the last event that mutated this comment.
   * Clients use this for optimistic UI reconciliation against the event log.
   */
  eventId: number;
}

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateCommentDto {
  parentId: string | null;
  message: string;
  author: ICommentAuthor;
}

export interface UpdateCommentDto {
  message: string;
}

export interface LikeCommentDto {
  userId: string;
}
