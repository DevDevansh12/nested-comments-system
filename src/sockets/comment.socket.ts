/**
 * comment.socket.ts — per-socket event handlers
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESPONSIBILITY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This file registers all client-facing Socket.IO event listeners on a single
 * socket. It is called once per connection from socket.ts.
 *
 * It handles:
 *   "sync"          — client requests missed events since lastEventId
 *   "disconnect"    — cleanup / logging
 *   "error"         — per-socket error logging
 *
 * It does NOT contain business logic. All data access goes through the
 * existing EventService so there is exactly one source of truth.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SYNC PROTOCOL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The client's reconnect flow is:
 *
 *   1. On initial load:  GET /api/v1/comments returns latestEventId.
 *      Client stores it locally.
 *
 *   2. Client connects to Socket.IO and immediately emits:
 *        sync { lastEventId: <stored value> }
 *
 *   3. Server calls EventService.getEventsAfter(lastEventId).
 *      Events are returned sorted ascending (lowest eventId first).
 *
 *   4. Server emits each missed event individually, using the event's `type`
 *      as the socket event name. This lets the client reuse the same handler
 *      it uses for live events — no special "replay" handler needed.
 *
 *   5. After all missed events, server emits:
 *        sync_complete { latestEventId: <current head> }
 *      The client updates its stored cursor and resumes normal operation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ERROR ISOLATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every async handler is wrapped in try/catch. Errors are logged and reported
 * back to the originating socket via "socket_error", but never re-thrown.
 * A crash inside a socket handler must never propagate to the process and
 * kill the server.
 */

import { Socket } from "socket.io";
import {
  getEventsAfter,
  getLatestEventId,
} from "../services/event.service";
import { BroadcastEnvelope } from "./socket";

// ─── Incoming event payload types ─────────────────────────────────────────────

/**
 * Payload the client sends with the "sync" event.
 * lastEventId: the highest eventId the client has already processed.
 * Pass 0 to request all events from the beginning.
 */
interface SyncPayload {
  lastEventId: number;
}

/**
 * Payload emitted back to the client after a successful sync.
 */
interface SyncCompletePayload {
  latestEventId: number;
}

/**
 * Payload emitted back to the client when a socket-level error occurs.
 */
interface SocketErrorPayload {
  message: string;
}

// ─── Type guard ───────────────────────────────────────────────────────────────

/**
 * Validates that an unknown value is a well-formed SyncPayload.
 *
 * We cannot trust the shape of data arriving over the network. This guard
 * ensures `lastEventId` is a finite non-negative integer before we pass it
 * to the EventService.
 */
function isSyncPayload(value: unknown): value is SyncPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "lastEventId" in value &&
    typeof (value as Record<string, unknown>).lastEventId === "number" &&
    Number.isFinite((value as Record<string, unknown>).lastEventId as number) &&
    (value as Record<string, unknown>).lastEventId as number >= 0
  );
}

// ─── Handler registration ─────────────────────────────────────────────────────

/**
 * Registers all comment-related Socket.IO event listeners on a single socket.
 * Called once per connection from socket.ts.
 *
 * @param socket  The individual Socket.IO socket for one connected client.
 */
export function registerCommentSocketHandlers(socket: Socket): void {
  // ── sync ────────────────────────────────────────────────────────────────────
  /**
   * Handles the client's missed-event catch-up request.
   *
   * The client emits this immediately after connecting (or reconnecting) with
   * the eventId of the last event it successfully processed.
   *
   * We emit missed events one at a time using the same event names the live
   * broadcast uses (event.type = "COMMENT_CREATED" etc.). This means the
   * client's event handler is identical for live events and replayed events.
   *
   * We emit sync_complete last so the client knows the replay is finished
   * before it starts acting on new live events that may arrive concurrently.
   */
  socket.on("sync", async (rawPayload: unknown): Promise<void> => {
    try {
      // ── Validate input ─────────────────────────────────────────────────────
      if (!isSyncPayload(rawPayload)) {
        const err: SocketErrorPayload = {
          message:
            "Invalid sync payload. Expected { lastEventId: number } where lastEventId >= 0.",
        };
        socket.emit("socket_error", err);
        return;
      }

      const { lastEventId } = rawPayload;

      console.log(
        `[Socket.IO] sync requested by ${socket.id}, lastEventId=${lastEventId}`
      );

      // ── Fetch missed events from the persistent store ──────────────────────
      // EventService.getEventsAfter() returns events sorted ascending by
      // eventId, so the client replays them in the correct order.
      const missedEvents = await getEventsAfter(lastEventId);

      // ── Replay each missed event individually ──────────────────────────────
      for (const event of missedEvents) {
        const envelope: BroadcastEnvelope = {
          eventId: event.eventId,
          type: event.type,
          payload: event.payload,
        };
        // Emit using the same event name as the live broadcast so the client
        // handler is unified. Only emit to this socket, not io.emit().
        socket.emit(event.type, envelope);
      }

      // ── Confirm sync is complete ───────────────────────────────────────────
      // The client uses latestEventId to update its local cursor so future
      // sync requests ask for the right window.
      const latestEventId = await getLatestEventId();
      const complete: SyncCompletePayload = { latestEventId };
      socket.emit("sync_complete", complete);

      console.log(
        `[Socket.IO] sync complete for ${socket.id}: ` +
          `replayed ${missedEvents.length} events, head=${latestEventId}`
      );
    } catch (err) {
      // Log and surface to the client — never rethrow (would crash the server)
      console.error(`[Socket.IO] sync error for socket ${socket.id}:`, err);
      const payload: SocketErrorPayload = {
        message: "An error occurred while processing your sync request.",
      };
      socket.emit("socket_error", payload);
    }
  });

  // ── disconnect ──────────────────────────────────────────────────────────────
  /**
   * Fired when the client disconnects (tab closed, network lost, etc.).
   * The `reason` string is provided by Socket.IO and describes why the
   * connection ended (e.g. "transport close", "ping timeout").
   *
   * No cleanup is needed in this architecture because we don't maintain
   * per-socket state beyond what Socket.IO manages internally.
   */
  socket.on("disconnect", (reason: string): void => {
    console.log(
      `[Socket.IO] Client disconnected: ${socket.id}, reason=${reason}`
    );
  });

  // ── error ───────────────────────────────────────────────────────────────────
  /**
   * Fired when the underlying transport encounters an error (e.g. network
   * interruption mid-message, malformed frame). Socket.IO will close the
   * socket after this event. We log it for observability.
   */
  socket.on("error", (err: Error): void => {
    console.error(`[Socket.IO] Socket error on ${socket.id}:`, err.message);
  });
}
