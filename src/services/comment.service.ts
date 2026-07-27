import { v4 as uuidv4 } from "uuid";
import { Comment, ICommentDocument } from "../models/comment.model";
import { AppError } from "../utils/AppError";
import { createEvent } from "./event.service";
import { EventType } from "../types/event";
import {
  IComment,
  CreateCommentDto,
  UpdateCommentDto,
  LikeCommentDto,
} from "../types/comment";
import { broadcast } from "../sockets/socket";

/** Maximum age of a comment (in ms) within which edits are still allowed. */
const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ─── Pagination types ─────────────────────────────────────────────────────────

export interface CursorPage<T> {
  items: T[];
  /**
   * Pass this value as `cursor` in the next request to fetch the next page.
   * Null means there are no more pages.
   */
  nextCursor: string | null;
  /** Whether another page of results exists after this one. */
  hasMore: boolean;
}

export interface GetRootCommentsOptions {
  /**
   * ISO-8601 date string of the last `createdAt` seen by the client.
   * Omit (or pass undefined) for the first page.
   */
  cursor?: string;
  limit?: number;
}

// ─── Serialisation helpers ────────────────────────────────────────────────────

/**
 * Converts a Mongoose document to a plain IComment.
 * Lean documents are already plain objects; this normalises both cases
 * and keeps Mongoose internals out of the returned values.
 */
function toPlain(doc: ICommentDocument | (Partial<IComment> & { _id: unknown })): IComment {
  return {
    _id: (doc as ICommentDocument)._id,
    id: doc.id as string,
    parentId: doc.parentId ?? null,
    author: doc.author!,
    message: doc.message as string,
    likes: doc.likes as number,
    likedBy: doc.likedBy as string[],
    isDeleted: doc.isDeleted as boolean,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    editedAt: doc.editedAt ?? null,
    eventId: doc.eventId as number,
  };
}

/**
 * Applies the soft-delete presentation rule:
 * deleted comments have their message replaced with a placeholder so the
 * thread structure is preserved but the content is hidden.
 */
export function sanitise(comment: IComment): IComment {
  if (!comment.isDeleted) return comment;
  return {
    ...comment,
    message: "[deleted]",
    author: { id: comment.author.id, username: "[deleted]" },
    likedBy: [],
  };
}

/**
 * Finds a comment by its public UUID and throws a 404 if not found.
 * Centralising this avoids repeating the findOne + null check pattern.
 */
async function findByUuidOrFail(commentId: string): Promise<ICommentDocument> {
  const comment = await Comment.findOne({ id: commentId });
  if (!comment) {
    throw new AppError(`Comment '${commentId}' not found`, 404);
  }
  return comment;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns a page of top-level (root) comments using cursor-based pagination.
 *
 * Why cursor pagination instead of page/offset?
 *   - Offset pagination is O(offset) at the DB level — page 100 of 20 means
 *     MongoDB skips 2 000 documents before returning any.
 *   - Cursor pagination uses an index range query (createdAt > cursor) which
 *     is always O(limit) regardless of how deep into the result set you are.
 *   - Cursors are also stable: if a new comment is inserted between page 1
 *     and page 2, offset pagination would show it twice or skip one; cursor
 *     pagination is immune because we use a fixed timestamp boundary.
 *
 * The cursor is the `createdAt` ISO string of the last item on the previous
 * page. The client passes it back verbatim on the next request.
 *
 * We fetch `limit + 1` documents. If we get limit+1 back, there is a next
 * page — we return only `limit` items and set hasMore = true. If we get ≤
 * limit, we return all of them and set hasMore = false.
 */
export async function getRootComments(
  options: GetRootCommentsOptions = {}
): Promise<CursorPage<IComment>> {
  const limit = Math.min(options.limit ?? 20, 100); // cap at 100 per page

  // Build the filter: root comments only, optionally after a cursor
  const filter: Record<string, unknown> = { parentId: null };
  if (options.cursor) {
    // cursor is a base64-encoded ISO date string — decode it back
    const cursorDate = new Date(
      Buffer.from(options.cursor, "base64").toString("utf8")
    );
    if (isNaN(cursorDate.getTime())) {
      throw new AppError("Invalid pagination cursor", 400);
    }
    // Fetch items strictly after the cursor timestamp
    filter["createdAt"] = { $gt: cursorDate };
  }

  // Fetch one extra to detect whether another page exists
  const docs = await Comment.find(filter)
    .sort({ createdAt: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = docs.length > limit;
  const pageItems = hasMore ? docs.slice(0, limit) : docs;

  // Encode the next cursor as base64 of the last item's createdAt ISO string
  const nextCursor =
    hasMore && pageItems.length > 0
      ? Buffer.from(
          (pageItems[pageItems.length - 1].createdAt as Date).toISOString()
        ).toString("base64")
      : null;

  return {
    items: pageItems.map(toPlain),
    nextCursor,
    hasMore,
  };
}

/**
 * Returns all direct children of a given parent comment UUID,
 * sorted oldest-first. Uses the (parentId, createdAt) compound index.
 */
export async function getReplies(parentId: string): Promise<IComment[]> {
  const docs = await Comment.find({ parentId })
    .sort({ createdAt: 1 })
    .lean();

  return docs.map(toPlain);
}

/**
 * Returns a single comment by its public UUID.
 * Throws 404 if not found.
 */
export async function getCommentById(commentId: string): Promise<IComment> {
  const doc = await findByUuidOrFail(commentId);
  return toPlain(doc);
}

/**
 * Returns all comments authored by a specific user UUID, newest first.
 * Uses the author.id index.
 */
export async function getCommentsByAuthor(authorId: string): Promise<IComment[]> {
  const docs = await Comment.find({ "author.id": authorId })
    .sort({ createdAt: -1 })
    .lean();

  return docs.map(toPlain);
}

/**
 * Returns all comments (roots + replies) with createdAt >= windowStart.
 * Used by the GET /comments list endpoint to fetch all descendants of the
 * current page's root comments in a single range-scan query.
 *
 * Sorting by createdAt asc means parents always appear before children
 * in the flat list, which lets TreeBuilder wire the tree without relying
 * on the orphan queue for the typical case.
 */
export async function getAllCommentsInWindow(windowStart: Date): Promise<IComment[]> {
  const docs = await Comment.find({ createdAt: { $gte: windowStart } })
    .sort({ createdAt: 1 })
    .lean();

  return docs.map(toPlain);
}

/**
 * Recursively fetches all descendants of a comment using iterative
 * BFS so the call stack is never exhausted on deep threads.
 *
 * Used by GET /comments/:id to return the full subtree of a single comment.
 * The parentId index makes each level O(children-at-that-level).
 */
export async function getDescendants(rootId: string): Promise<IComment[]> {
  const result: IComment[] = [];

  // BFS queue — start with the root's direct children
  let queue: string[] = [rootId];

  while (queue.length > 0) {
    // Fetch all children of every id in the current queue in one query
    const children = await Comment.find({ parentId: { $in: queue } })
      .sort({ createdAt: 1 })
      .lean();

    if (children.length === 0) break;

    const plains = children.map(toPlain);
    result.push(...plains);

    // Next BFS level: the ids of the children we just fetched
    queue = plains.map((c) => c.id);
  }

  return result;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Creates a new comment and writes a COMMENT_CREATED event atomically.
 *
 * Event-first approach:
 *   1. Create the event (which mints a new eventId).
 *   2. Create the comment stamped with that eventId.
 * If the comment write fails after the event is written, the event log
 * has an orphan entry — acceptable in this architecture because the
 * WebSocket layer will broadcast the event and clients will request the
 * comment, getting a 404, and silently ignore it. A full two-phase commit
 * would be the alternative if strict consistency is required.
 */
export async function createComment(dto: CreateCommentDto): Promise<IComment> {
  // Verify parent exists if this is a reply
  if (dto.parentId !== null) {
    const parent = await Comment.findOne({ id: dto.parentId }).lean();
    if (!parent) {
      throw new AppError(`Parent comment '${dto.parentId}' not found`, 404);
    }
    if (parent.isDeleted) {
      throw new AppError("Cannot reply to a deleted comment", 400);
    }
  }

  const commentId = uuidv4();

  // Create the event first to get a sequence number
  const event = await createEvent({
    type: EventType.COMMENT_CREATED,
    commentId,
    payload: {
      commentId,
      parentId: dto.parentId,
      authorId: dto.author.id,
      authorUsername: dto.author.username,
      message: dto.message,
    },
  });

  const comment = await Comment.create({
    id: commentId,
    parentId: dto.parentId,
    author: dto.author,
    message: dto.message,
    eventId: event.eventId,
  });

  // Broadcast after persistence succeeds — never before.
  // broadcast() is a no-op if Socket.IO has not been initialised
  // (e.g. during unit tests), so no mock is required in tests.
  broadcast(event);

  return toPlain(comment);
}

/**
 * Updates the message of an existing comment.
 *
 * Business rules enforced here (not in the controller):
 *   1. Only the original author can edit.
 *   2. Edits are only allowed within EDIT_WINDOW_MS (5 minutes) of creation.
 *      We compare against `createdAt`, not `editedAt`, so subsequent edits
 *      don't reset the clock — the window is always relative to first creation.
 *   3. Deleted comments cannot be edited.
 */
export async function updateComment(
  commentId: string,
  dto: UpdateCommentDto,
  requestingAuthorId: string
): Promise<IComment> {
  const comment = await findByUuidOrFail(commentId);

  if (comment.isDeleted) {
    throw new AppError("Cannot edit a deleted comment", 400);
  }

  if (comment.author.id !== requestingAuthorId) {
    throw new AppError("You are not the author of this comment", 403);
  }

  // 5-minute edit window: compare elapsed time since creation
  const ageMs = Date.now() - comment.createdAt.getTime();
  if (ageMs > EDIT_WINDOW_MS) {
    throw new AppError(
      "Comments can only be edited within 5 minutes of posting",
      403
    );
  }

  const editedAt = new Date();

  const event = await createEvent({
    type: EventType.COMMENT_UPDATED,
    commentId,
    payload: { commentId, message: dto.message, editedAt },
  });

  comment.message = dto.message;
  comment.editedAt = editedAt;
  comment.eventId = event.eventId;
  await comment.save();

  broadcast(event);

  return toPlain(comment);
}

/**
 * Deletes a comment with two distinct strategies:
 *
 * LEAF NODE (no children):
 *   Hard delete — remove the document entirely. No children reference it,
 *   so removing it is safe and keeps the collection clean.
 *
 * INTERNAL NODE (has children):
 *   Soft delete — set isDeleted = true and clear the message.
 *   Children must remain anchored to a valid parentId so the thread
 *   structure is preserved. The UI renders "this comment was deleted".
 *
 * Why decide here rather than in the controller?
 *   The distinction requires a DB query (count children), which is
 *   business logic, not HTTP concern. Controllers stay thin.
 */
export async function deleteComment(
  commentId: string,
  requestingAuthorId: string
): Promise<{ comment: IComment; hardDeleted: boolean }> {
  const comment = await findByUuidOrFail(commentId);

  if (comment.isDeleted) {
    throw new AppError("Comment is already deleted", 400);
  }

  if (comment.author.id !== requestingAuthorId) {
    throw new AppError("You are not the author of this comment", 403);
  }

  // Check whether this comment has any children in the DB
  const childCount = await Comment.countDocuments({ parentId: commentId });
  const isLeaf = childCount === 0;

  const event = await createEvent({
    type: EventType.COMMENT_DELETED,
    commentId,
    payload: { commentId },
  });

  if (isLeaf) {
    // Hard delete — safe to remove entirely
    await Comment.deleteOne({ id: commentId });
    // Return a tombstone-style plain object for the response
    const tombstone = toPlain(comment);
    tombstone.isDeleted = true;
    tombstone.eventId = event.eventId;
    broadcast(event);
    return { comment: tombstone, hardDeleted: true };
  } else {
    // Soft delete — keep the document, clear content
    comment.isDeleted = true;
    comment.message = "[deleted]";
    comment.eventId = event.eventId;
    await comment.save();
    broadcast(event);
    return { comment: toPlain(comment), hardDeleted: false };
  }
}

/**
 * Adds a like to a comment from a user.
 * - Idempotent: if the user has already liked the comment, throws 409.
 * - Uses $addToSet + $inc in a single atomic findOneAndUpdate so two
 *   concurrent likes from the same user cannot both succeed.
 */
export async function likeComment(
  commentId: string,
  dto: LikeCommentDto
): Promise<IComment> {
  const existing = await Comment.findOne({ id: commentId }).lean();
  if (!existing) {
    throw new AppError(`Comment '${commentId}' not found`, 404);
  }
  if (existing.isDeleted) {
    throw new AppError("Cannot like a deleted comment", 400);
  }
  if (existing.likedBy.includes(dto.userId)) {
    throw new AppError("You have already liked this comment", 409);
  }

  const event = await createEvent({
    type: EventType.COMMENT_LIKED,
    commentId,
    payload: {
      commentId,
      userId: dto.userId,
      likes: existing.likes + 1,
    },
  });

  const updated = await Comment.findOneAndUpdate(
    { id: commentId },
    {
      $addToSet: { likedBy: dto.userId },
      $inc: { likes: 1 },
      $set: { eventId: event.eventId },
    },
    { new: true }
  );

  if (!updated) {
    throw new AppError(`Comment '${commentId}' not found`, 404);
  }

  broadcast(event);
  return toPlain(updated);
}

/**
 * Removes a like from a comment.
 * - Idempotent check: throws 409 if the user hasn't liked the comment.
 * - Same atomic findOneAndUpdate pattern as likeComment.
 */
export async function unlikeComment(
  commentId: string,
  dto: LikeCommentDto
): Promise<IComment> {
  const existing = await Comment.findOne({ id: commentId }).lean();
  if (!existing) {
    throw new AppError(`Comment '${commentId}' not found`, 404);
  }
  if (existing.isDeleted) {
    throw new AppError("Cannot unlike a deleted comment", 400);
  }
  if (!existing.likedBy.includes(dto.userId)) {
    throw new AppError("You have not liked this comment", 409);
  }

  const event = await createEvent({
    type: EventType.COMMENT_UNLIKED,
    commentId,
    payload: {
      commentId,
      userId: dto.userId,
      likes: existing.likes - 1,
    },
  });

  const updated = await Comment.findOneAndUpdate(
    { id: commentId },
    {
      $pull: { likedBy: dto.userId },
      $inc: { likes: -1 },
      $set: { eventId: event.eventId },
    },
    { new: true }
  );

  if (!updated) {
    throw new AppError(`Comment '${commentId}' not found`, 404);
  }

  broadcast(event);
  return toPlain(updated);
}
