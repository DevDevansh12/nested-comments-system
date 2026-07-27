import { Counter } from "../models/counter.model";
import { Event, IEventDocument } from "../models/event.model";
import { CreateEventDto, IEvent } from "../types/event";
import { AppError } from "../utils/AppError";

/** The name key used in the counters collection for the event sequence */
const EVENT_COUNTER_KEY = "eventId";

// ─── Sequence generator ───────────────────────────────────────────────────────

/**
 * Returns the next monotonically increasing eventId in an atomic operation.
 *
 * Implementation details:
 *   - findOneAndUpdate with upsert:true creates the counter document on the
 *     first call so no manual initialisation is needed.
 *   - $inc is applied atomically by MongoDB's document-level locking, meaning
 *     two concurrent calls will always receive different integers.
 *   - returnDocument: "after" returns the document AFTER the increment so the
 *     returned seq is the value that was just reserved for the caller.
 *
 * This is the standard "atomic counter" pattern for MongoDB and is safe under
 * any level of write concurrency without transactions.
 */
export async function getNextEventId(): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { name: EVENT_COUNTER_KEY },
    { $inc: { seq: 1 } },
    {
      upsert: true,           // create the counter doc if it doesn't exist yet
      returnDocument: "after", // return the post-increment value
      new: true,
    }
  );

  if (!counter) {
    // Should never happen given upsert:true, but satisfies strict null checks
    throw new AppError("Failed to generate event ID", 500, false);
  }

  return counter.seq;
}

// ─── Event creation ───────────────────────────────────────────────────────────

/**
 * Creates a new event document with a freshly minted eventId.
 *
 * The caller provides the type, commentId, and typed payload.
 * The eventId is generated here so service callers never have to worry
 * about sequencing — it is always correct and always unique.
 *
 * Returns the full saved event so the caller can:
 *   a) Stamp the eventId onto the mutated Comment document
 *   b) Broadcast the event over WebSockets (future layer)
 */
export async function createEvent(dto: CreateEventDto): Promise<IEvent> {
  const eventId = await getNextEventId();

  const event = await Event.create({
    eventId,
    type: dto.type,
    commentId: dto.commentId,
    payload: dto.payload,
  });

  return toPlainEvent(event);
}

// ─── Event queries ────────────────────────────────────────────────────────────

/**
 * Returns all events with eventId strictly greater than the provided cursor.
 *
 * This is the core of the WebSocket catch-up / polling protocol:
 *   - On reconnect, the client sends its last-seen eventId.
 *   - The server returns the delta: every event the client missed.
 *   - The client replays the delta to bring its local state up to date.
 *
 * Results are sorted ascending so the client can apply them in order.
 *
 * @param lastEventId  The last eventId the caller has already processed.
 *                     Pass 0 to receive all events from the beginning.
 */
export async function getEventsAfter(lastEventId: number): Promise<IEvent[]> {
  const events = await Event.find({ eventId: { $gt: lastEventId } })
    .sort({ eventId: 1 })  // ascending — replay order matters
    .lean();

  return events.map(toPlainEvent);
}

/**
 * Returns a single event by its eventId, or null if it doesn't exist.
 * Useful for idempotency checks and audit queries.
 */
export async function getEventById(eventId: number): Promise<IEvent | null> {
  const event = await Event.findOne({ eventId }).lean();
  return event ? toPlainEvent(event) : null;
}

/**
 * Returns the most recent eventId in the store.
 * Clients can call this to learn the current "head" before subscribing
 * to the event stream so they know where to start.
 *
 * Returns 0 if no events exist yet (safe default for getEventsAfter).
 */
export async function getLatestEventId(): Promise<number> {
  const latest = await Event.findOne()
    .sort({ eventId: -1 })
    .select("eventId")
    .lean();

  return latest?.eventId ?? 0;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Converts a Mongoose lean document to a plain IEvent.
 * Using lean() + an explicit mapper is faster than toObject() and keeps
 * Mongoose internals out of the returned objects.
 */
function toPlainEvent(doc: IEventDocument | (Omit<IEvent, "_id"> & { _id: unknown })): IEvent {
  return {
    _id: (doc as IEventDocument)._id,
    eventId: doc.eventId,
    type: doc.type,
    commentId: doc.commentId,
    payload: doc.payload,
    createdAt: doc.createdAt,
  };
}
