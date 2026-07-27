/**
 * comment.controller.ts
 *
 * Controllers are intentionally thin:
 *   - Parse and validate HTTP input (req.params, req.body, req.query)
 *   - Call the appropriate service function
 *   - Send the HTTP response
 *
 * All business rules (ownership, edit window, leaf-vs-soft-delete, etc.)
 * live in comment.service.ts, not here.
 */

import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import { AppError } from "../utils/AppError";
import { TreeBuilder, CommentNode } from "../utils/TreeBuilder";
import * as commentService from "../services/comment.service";
import * as eventService from "../services/event.service";
import { IComment } from "../types/comment";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the authenticated user's string ID from req.user.
 * req.user is guaranteed non-null on protected routes because the
 * `protect` middleware runs before any write handler.
 * We use _id.toString() because req.user._id is a Mongoose ObjectId.
 */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401);
  }
  return req.user._id.toString();
}

/**
 * Recursively sanitises a CommentNode tree for API responses:
 *   - Replaces deleted content with "[deleted]" placeholders
 *   - Strips likedBy (large array of UUIDs not needed by the UI)
 */
function sanitiseNode(node: CommentNode<IComment>): object {
  const { likedBy: _omit, ...safeData } = commentService.sanitise(node.data);
  return {
    data: safeData,
    children: node.children.map(sanitiseNode),
  };
}

// ─── GET /api/v1/comments ─────────────────────────────────────────────────────

/**
 * Returns the first page of root comments as a nested tree.
 *
 * Query params:
 *   cursor  — opaque base64 string from the previous response's nextCursor
 *   limit   — items per page (default 20, max 100)
 *
 * Response:
 *   {
 *     roots: CommentNode[],   // tree of root + all descendants
 *     nextCursor: string | null,
 *     hasMore: boolean,
 *     latestEventId: number   // client stores this for WebSocket catch-up
 *   }
 *
 * Why return the whole subtree per root page?
 *   A comment thread page always needs all descendants of the visible roots.
 *   Fetching them in one round-trip is far cheaper than N+1 lazy loads.
 *   The tree is bounded by the cursor window (20 roots at a time), so
 *   even a heavily-threaded page stays manageable.
 */
export const getComments = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    if (isNaN(limit) || limit < 1) {
      throw new AppError("limit must be a positive integer", 400);
    }

    // 1. Fetch the paginated root comments
    const page = await commentService.getRootComments({ cursor, limit });

    if (page.items.length === 0) {
      const latestEventId = await eventService.getLatestEventId();
      sendSuccess(res, { roots: [], nextCursor: null, hasMore: false, latestEventId });
      return;
    }

    // 2. Fetch ALL descendants of the root comments in this page.
    //    We collect the root UUIDs, then query for every comment whose
    //    `parentId` chain leads back to one of them.
    //    Because we sort by createdAt asc the tree will have siblings
    //    in chronological order.
    //
    //    Implementation note: we use the createdAt range of the page
    //    (from the first root's createdAt to now) and let TreeBuilder
    //    assemble the hierarchy. This avoids a recursive query — a single
    //    range scan + O(n) TreeBuilder pass is far cheaper.
    const rootIds = new Set(page.items.map((c) => c.id));

    // Fetch all comments whose createdAt is within the page window.
    // We start at the first root's createdAt so we don't fetch comments
    // from earlier pages.
    const pageStart = page.items[0].createdAt;
    const allInWindow = await commentService.getAllCommentsInWindow(pageStart);

    // Build the tree — TreeBuilder handles the orphan queue automatically
    // for any replies that arrive before their parent in the flat list.
    const { roots: allRoots } = TreeBuilder.fromArray(allInWindow);

    // Filter to only the roots that belong to this page
    const pageRoots = allRoots.filter((node) => rootIds.has(node.data.id));

    // Sanitise: replace deleted content with placeholders, strip likedBy
    // We do a deep map to apply sanitise at every level of the tree
    const sanitisedRoots = pageRoots.map(sanitiseNode);

    // Fetch the current head of the event log so the client knows where to
    // start listening when it connects to the WebSocket stream.
    const latestEventId = await eventService.getLatestEventId();

    sendSuccess(res, {
      roots: sanitisedRoots,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      latestEventId,
    });
  }
);

// ─── GET /api/v1/comments/:id ─────────────────────────────────────────────────

/**
 * Returns a single comment with its full subtree of descendants.
 * Used for deep-link navigation to a specific comment.
 */
export const getComment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const comment = await commentService.getCommentById(id);

    // Fetch all descendants of this comment
    const allDescendants = await commentService.getDescendants(id);
    const { roots } = TreeBuilder.fromArray([comment, ...allDescendants]);

    // roots should be exactly one node (the requested comment)
    const root = roots[0];
    if (!root) {
      throw new AppError(`Comment '${id}' not found`, 404);
    }

    sendSuccess(res, sanitiseNode(root));
  }
);

// ─── POST /api/v1/comments ────────────────────────────────────────────────────

/**
 * Creates a new top-level (root) comment.
 *
 * Body: { message: string }
 *
 * The author object is built from the authenticated user (req.user),
 * so the client cannot spoof authorship.
 */
export const createComment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authorId = requireUserId(req);
    const { message } = req.body as { message: string };

    const comment = await commentService.createComment({
      parentId: null,
      message,
      author: {
        id: authorId,
        username: req.user!.username,
      },
    });

    sendSuccess(res, commentService.sanitise(comment), 201, "Comment created");
  }
);

// ─── POST /api/v1/comments/:id/reply ─────────────────────────────────────────

/**
 * Creates a reply to an existing comment.
 *
 * Body: { message: string }
 * Params: id — the UUID of the parent comment
 *
 * The service validates that the parent exists and is not deleted.
 */
export const replyToComment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authorId = requireUserId(req);
    const { id: parentId } = req.params;
    const { message } = req.body as { message: string };

    const comment = await commentService.createComment({
      parentId,
      message,
      author: {
        id: authorId,
        username: req.user!.username,
      },
    });

    sendSuccess(res, commentService.sanitise(comment), 201, "Reply created");
  }
);

// ─── PATCH /api/v1/comments/:id ───────────────────────────────────────────────

/**
 * Edits the message of an existing comment.
 *
 * Body: { message: string }
 *
 * The service enforces:
 *   - Requesting user must be the author
 *   - Edit must happen within 5 minutes of creation
 */
export const updateComment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authorId = requireUserId(req);
    const { id } = req.params;
    const { message } = req.body as { message: string };

    const updated = await commentService.updateComment(
      id,
      { message },
      authorId
    );

    sendSuccess(res, commentService.sanitise(updated), 200, "Comment updated");
  }
);

// ─── DELETE /api/v1/comments/:id ─────────────────────────────────────────────

/**
 * Deletes a comment.
 *
 * The service decides between hard and soft delete:
 *   - Leaf node (no replies): hard delete — document removed from DB
 *   - Internal node (has replies): soft delete — isDeleted = true, message cleared
 *
 * Both paths create a COMMENT_DELETED event so the client can sync.
 */
export const deleteComment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const authorId = requireUserId(req);
    const { id } = req.params;

    const { comment, hardDeleted } = await commentService.deleteComment(
      id,
      authorId
    );

    sendSuccess(
      res,
      { comment: commentService.sanitise(comment), hardDeleted },
      200,
      hardDeleted ? "Comment removed" : "Comment deleted"
    );
  }
);

// ─── POST /api/v1/comments/:id/like ──────────────────────────────────────────

/**
 * Toggles a like on a comment.
 *
 * If the user has NOT liked the comment: add a like.
 * If the user HAS already liked it: remove the like (unlike).
 *
 * This "toggle" design means the client doesn't need a separate unlike
 * endpoint — a single button calls POST /like repeatedly.
 *
 * Implementation note on atomicity:
 *   We do NOT read the comment first to decide the direction. That pattern
 *   creates a TOCTOU race: two concurrent requests could both read "not liked"
 *   and both attempt to add a like.
 *
 *   Instead we attempt likeComment first. If the service throws 409
 *   ("already liked") we fall through to unlikeComment. Both service functions
 *   use atomic MongoDB $addToSet / $pull so no concurrent request can corrupt
 *   the counter, and the final state is always consistent regardless of order.
 *
 * The response always includes the updated `likes` count and a `liked` boolean.
 */
export const toggleLike = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserId(req);
    const { id: commentId } = req.params;

    let updated: IComment;
    let liked: boolean;

    try {
      // Optimistically attempt to add a like
      updated = await commentService.likeComment(commentId, { userId });
      liked = true;
    } catch (err) {
      // If the user already liked the comment the service throws 409 —
      // treat that as a signal to unlike instead.
      if (err instanceof AppError && err.statusCode === 409) {
        updated = await commentService.unlikeComment(commentId, { userId });
        liked = false;
      } else {
        // Any other error (404, 400, etc.) propagates normally
        throw err;
      }
    }

    sendSuccess(res, { likes: updated.likes, liked }, 200);
  }
);
