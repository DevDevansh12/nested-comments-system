import { Schema, model, Document, Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { IComment, ICommentAuthor } from "../types/comment";

/**
 * Mongoose Document shape for a Comment.
 *
 * We cannot extend both `IComment` and `Document` simultaneously because
 * Mongoose's `Document` declares `id` as `string` (a virtual getter that
 * returns `_id.toString()`), while our `IComment.id` is also `string` but
 * represents the UUID field — TypeScript sees two declarations of the same
 * property from different base interfaces and rejects the merge.
 *
 * Solution: omit `id` from `IComment` before extending, then re-declare
 * it as `string` so both the Mongoose virtual and our UUID field resolve
 * to the same type. At runtime the schema field named `id` wins over the
 * virtual because we defined it explicitly, which is the behaviour we want.
 */
export interface ICommentDocument extends Omit<IComment, "_id" | "id">, Document {
  _id: Types.ObjectId;
  /** Public UUID v4 — stored as a real field, overrides Mongoose's id virtual */
  id: string;
}

// ─── Author sub-schema ────────────────────────────────────────────────────────

/**
 * Defined as a standalone sub-schema so it gets its own _id: false
 * (we never need to look up an author sub-doc in isolation) and can
 * be reused if other models need the same shape.
 */
const authorSchema = new Schema<ICommentAuthor>(
  {
    id: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false } // sub-documents don't need their own _id
);

// ─── Comment schema ───────────────────────────────────────────────────────────

const commentSchema = new Schema<ICommentDocument>(
  {
    /**
     * Public UUID v4. This is separate from _id for two reasons:
     *   1. ObjectIds encode creation time and machine info — UUIDs are opaque.
     *   2. UUID format is storage-agnostic; if the data ever moves to Postgres
     *      or a cache, the client-facing IDs remain identical.
     *
     * A unique index on this field makes UUID-based lookups O(log n), the
     * same cost as an ObjectId lookup.
     */
    id: {
      type: String,
      required: true,
      // Default populated automatically so callers never have to pass it
      default: uuidv4,
      immutable: true, // a comment's public ID never changes
    },

    /**
     * UUID of the parent comment.  null means this is a root-level comment.
     * We use a flat adjacency-list model rather than nested arrays because:
     *   - Nested arrays hit MongoDB's 16 MB document limit on large threads
     *   - Updates to deeply nested paths require complex positional operators
     *   - Adjacency lists let clients build the tree themselves in O(n)
     */
    parentId: {
      type: String,
      default: null,
    },

    author: {
      type: authorSchema,
      required: [true, "Author is required"],
    },

    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: [1000, "Message cannot exceed 1000 characters"],
    },

    likes: {
      type: Number,
      default: 0,
      min: [0, "Likes cannot be negative"],
    },

    /**
     * Stores the UUIDs of users who liked the comment.
     * Using an array of IDs rather than a separate likes collection
     * keeps the like check a simple $in query on the document itself
     * and avoids an extra collection for a small-cardinality field.
     * If a comment can accumulate millions of likes, migrate this to
     * a separate collection.
     */
    likedBy: {
      type: [String],
      default: [],
    },

    /**
     * Soft delete: set to true instead of removing the document.
     * This preserves the parentId chain so child comments are not
     * orphaned and still display in the thread hierarchy.
     */
    isDeleted: {
      type: Boolean,
      default: false,
    },

    /**
     * Null until the first edit so the client can distinguish
     * "never edited" from "edited at midnight on day zero".
     */
    editedAt: {
      type: Date,
      default: null,
    },

    /**
     * The eventId of the most recent mutation event for this comment.
     * Used by the WebSocket sync layer: when a client reconnects it
     * sends its last-seen eventId and gets a delta, not a full reload.
     */
    eventId: {
      type: Number,
      required: [true, "eventId is required"],
    },
  },
  {
    timestamps: true, // manages createdAt and updatedAt automatically
    versionKey: false,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * UNIQUE on `id` (UUID):
 * Every API request identifies comments by their UUID. Without this index
 * each findOne({ id }) scans the whole collection. unique: true also
 * prevents accidental UUID collisions (astronomically unlikely but enforced).
 */
commentSchema.index({ id: 1 }, { unique: true });

/**
 * `parentId`:
 * The most frequent query: "give me all direct children of comment X".
 * Without this, fetching replies requires a full collection scan.
 * Also covers root-comment queries where parentId = null.
 */
commentSchema.index({ parentId: 1 });

/**
 * `createdAt`:
 * Top-level comments are fetched in chronological order.
 * Combining this with a parentId filter uses the compound index below.
 */
commentSchema.index({ createdAt: 1 });

/**
 * Compound `(parentId, createdAt)`:
 * The canonical query for rendering a thread: "children of X, oldest first".
 * A compound index covers both the equality filter on parentId and the
 * sort on createdAt in a single B-tree traversal — no in-memory sort needed.
 */
commentSchema.index({ parentId: 1, createdAt: 1 });

/**
 * `eventId`:
 * The WebSocket catch-up query: "all comments touched by events > N".
 * Also lets us quickly find which comment belongs to a given event.
 */
commentSchema.index({ eventId: 1 });

/**
 * `author.id`:
 * Fetch all comments by a specific user (profile pages, moderation tools).
 * Dot-notation tells MongoDB to index the nested field directly.
 */
commentSchema.index({ "author.id": 1 });

export const Comment = model<ICommentDocument>("Comment", commentSchema);
