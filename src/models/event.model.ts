import { Schema, model, Document, Types } from "mongoose";
import { IEvent, EventType } from "../types/event";

/**
 * Mongoose Document shape for an Event.
 */
export interface IEventDocument extends Omit<IEvent, "_id">, Document {
  _id: Types.ObjectId;
}

// ─── Counter sub-schema for eventId sequence ──────────────────────────────────

/**
 * A separate "counter" document lives in its own collection and is
 * incremented atomically via findOneAndUpdate + $inc.  This collection
 * is defined in the event service — the schema here is for the events
 * themselves.
 */

// ─── Event schema ─────────────────────────────────────────────────────────────

const eventSchema = new Schema<IEventDocument>(
  {
    /**
     * Monotonically increasing integer ID.
     * Why an integer and not a UUID / ObjectId?
     *   - Clients use this as a cursor: "give me events after eventId 42".
     *     Integer comparison ( > 42 ) is simpler and faster than ObjectId
     *     comparison, and produces a predictable, gap-free sequence.
     *   - The unique index prevents any two events from sharing an ID,
     *     guaranteeing the client cursor is unambiguous.
     */
    eventId: {
      type: Number,
      required: [true, "eventId is required"],
    },

    /**
     * String enum keeps the log human-readable when inspected directly
     * in the database and avoids magic numbers that require a lookup table.
     */
    type: {
      type: String,
      enum: Object.values(EventType),
      required: [true, "Event type is required"],
    },

    /** UUID of the comment this event concerns — fast lookup of related events */
    commentId: {
      type: String,
      required: [true, "commentId is required"],
    },

    /**
     * Mixed / schema-less payload.
     * Each EventType has a known TypeScript payload interface (see types/event.ts)
     * but we don't enforce structure at the Mongoose level so we can evolve
     * payload shapes without database migrations. Validation is the service's job.
     */
    payload: {
      type: Schema.Types.Mixed,
      required: [true, "Payload is required"],
    },
  },
  {
    /**
     * Only createdAt is needed — events are immutable, so updatedAt is
     * meaningless. We set it explicitly rather than using timestamps: true
     * to avoid creating an updatedAt field that would mislead future readers.
     */
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * UNIQUE on `eventId`:
 * Guarantees the monotonic sequence has no duplicates. The unique
 * constraint is the safety net behind the atomic $inc counter —
 * if two concurrent increments somehow produced the same value,
 * the second write would fail rather than silently corrupt the log.
 *
 * Also the primary query path: getEventsAfter(n) does { eventId: { $gt: n } }
 * which becomes a B-tree range scan on this index.
 */
eventSchema.index({ eventId: 1 }, { unique: true });

/**
 * `createdAt`:
 * Supports chronological queries and is a candidate for a TTL index
 * if you want to automatically prune events older than N days:
 *   eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
 */
eventSchema.index({ createdAt: 1 });

/**
 * `commentId`:
 * Fetch all events for a specific comment (audit log, comment history).
 */
eventSchema.index({ commentId: 1 });

export const Event = model<IEventDocument>("Event", eventSchema);
