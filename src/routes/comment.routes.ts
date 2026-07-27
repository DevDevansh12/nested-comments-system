/**
 * comment.routes.ts
 *
 * Route definitions for the comment REST API.
 *
 * Auth strategy:
 *   GET  endpoints are public — no token required.
 *   POST / PATCH / DELETE endpoints require a valid JWT (protect middleware).
 *
 * Rate limiting strategy (applied after protect so req.user is populated):
 *   - POST /comments and POST /:id/reply  → 1 request per 3 s per user
 *   - PATCH / DELETE / POST /:id/like     → 30 requests per 60 s per user
 *
 * Validation strategy:
 *   Each mutating route has an inline validation chain followed by the
 *   `validate` middleware. Keeping validators next to routes makes the
 *   HTTP contract immediately visible without jumping to another file.
 */

import { Router } from "express";
import { body, param, query } from "express-validator";
import { protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  commentWriteRateLimit,
  commentActionRateLimit,
} from "../middleware/rateLimit.middleware";
import * as commentController from "../controllers/comment.controller";

const router = Router();

// ─── Shared validation chains ─────────────────────────────────────────────────

/**
 * Validates the :id route parameter on every route that accepts one.
 * UUID v4 format check ensures garbage values never reach the service.
 */
const validateCommentId = [
  param("id")
    .isUUID(4)
    .withMessage("Comment id must be a valid UUID v4"),
];

/**
 * Validates the message body field shared by create, reply, and update.
 */
const validateMessage = [
  body("message")
    .trim()
    .notEmpty()
    .withMessage("Message is required")
    .isLength({ max: 1000 })
    .withMessage("Message cannot exceed 1000 characters"),
];

/**
 * Validates the optional cursor pagination query params.
 */
const validateListQuery = [
  query("cursor")
    .optional()
    .isString()
    .withMessage("cursor must be a string"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be an integer between 1 and 100"),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/comments
 *
 * Public. Returns the first (or next) page of root comments as a nested
 * tree, including all descendants of each root on the page.
 *
 * Query params:
 *   cursor  — opaque pagination token (base64 encoded date)
 *   limit   — items per page, default 20, max 100
 */
router.get(
  "/",
  validateListQuery,
  validate,
  commentController.getComments
);

/**
 * GET /api/v1/comments/:id
 *
 * Public. Returns a single comment with its full subtree of descendants.
 */
router.get(
  "/:id",
  validateCommentId,
  validate,
  commentController.getComment
);

/**
 * POST /api/v1/comments
 *
 * Protected. Creates a new root-level comment.
 * Rate limited: 1 request per 3 seconds per user.
 * Body: { message: string }
 */
router.post(
  "/",
  protect,
  commentWriteRateLimit,  // rate limit runs after auth so req.user is available
  validateMessage,
  validate,
  commentController.createComment
);

/**
 * POST /api/v1/comments/:id/reply
 *
 * Protected. Creates a reply to the comment identified by :id.
 * Rate limited: 1 request per 3 seconds per user.
 * Body: { message: string }
 */
router.post(
  "/:id/reply",
  protect,
  commentWriteRateLimit,
  validateCommentId,
  validateMessage,
  validate,
  commentController.replyToComment
);

/**
 * PATCH /api/v1/comments/:id
 *
 * Protected. Edits the message of a comment.
 * Only the author can edit, and only within 5 minutes of posting.
 * Rate limited: 30 actions per 60 seconds per user.
 * Body: { message: string }
 */
router.patch(
  "/:id",
  protect,
  commentActionRateLimit,
  validateCommentId,
  validateMessage,
  validate,
  commentController.updateComment
);

/**
 * DELETE /api/v1/comments/:id
 *
 * Protected. Deletes a comment.
 *   - Leaf node → hard delete (document removed)
 *   - Internal node → soft delete (isDeleted = true, message = "[deleted]")
 * Rate limited: 30 actions per 60 seconds per user.
 */
router.delete(
  "/:id",
  protect,
  commentActionRateLimit,
  validateCommentId,
  validate,
  commentController.deleteComment
);

/**
 * POST /api/v1/comments/:id/like
 *
 * Protected. Toggles a like on a comment.
 * First call adds a like; second call removes it (unlike).
 * Rate limited: 30 actions per 60 seconds per user.
 * Returns: { likes: number, liked: boolean }
 */
router.post(
  "/:id/like",
  protect,
  commentActionRateLimit,
  validateCommentId,
  validate,
  commentController.toggleLike
);

export default router;
