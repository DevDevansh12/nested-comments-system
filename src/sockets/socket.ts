/**
 * socket.ts — Socket.IO singleton
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN RATIONALE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This module owns the single Socket.IO Server instance for the process.
 * It exposes three things:
 *
 *   init(httpServer)   — called once from server.ts to attach Socket.IO to the
 *                        existing HTTP server. Must be called before any route
 *                        handler or service attempts to broadcast.
 *
 *   broadcast(event)   — called from comment.service.ts immediately after a
 *                        successful createEvent() write. Emits to every
 *                        connected client. Never called from controllers.
 *
 *   getIO()            — returns the live Server instance for the socket
 *                        handler file (comment.socket.ts). Throws if init()
 *                        was not called first.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SINGLETON?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Socket.IO must be attached to the HTTP server before connections arrive.
 * We cannot import the Server at module-level in service files because the
 * HTTP server doesn't exist yet at import time. A singleton with a lazy
 * initialisation guard solves this cleanly without dependency injection
 * frameworks or constructor plumbing through every layer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY SERVICES CALL broadcast() — NOT CONTROLLERS?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The requirement is: "Every mutation already creates an Event. After an event
 * is successfully persisted, broadcast it." The event is persisted inside
 * comment.service.ts via createEvent(). That is the only place where
 * "persistence succeeded" is certain. Placing the broadcast there keeps the
 * guarantee tight: if the DB write fails, the function throws before reaching
 * broadcast(), so we never broadcast an event that wasn't saved.
 *
 * Controllers handle HTTP concerns only. They must not know that Socket.IO
 * exists.
 */

import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { env } from "../config/env";
import { IEvent } from "../types/event";
import { registerCommentSocketHandlers } from "./comment.socket";

// ─── Module-level singleton ───────────────────────────────────────────────────

let io: SocketServer | null = null;

// ─── Broadcast payload type ───────────────────────────────────────────────────

/**
 * The shape emitted to every connected client for every comment mutation.
 * Matches the spec: { eventId, type, payload }.
 *
 * We deliberately exclude `_id` and `createdAt` from the wire format — clients
 * don't need internal Mongoose identifiers or redundant timestamps (the payload
 * already carries mutation-specific timestamps where relevant).
 */
export interface BroadcastEnvelope {
  eventId: number;
  type: IEvent["type"];
  payload: IEvent["payload"];
}

// ─── init ─────────────────────────────────────────────────────────────────────

/**
 * Attaches a Socket.IO Server to the existing Node.js HTTP server and
 * registers all per-connection event handlers.
 *
 * Must be called exactly once, from server.ts, before server.listen().
 *
 * CORS is configured to match the same origin allowlist used by Express so
 * browser clients connecting on the same origin always work without extra
 * configuration.
 */
export function initSocket(httpServer: HttpServer): SocketServer {
  if (io) {
    // Guard against accidental double-initialisation (e.g. hot-reload in dev)
    return io;
  }

  io = new SocketServer(httpServer, {
    cors: {
      origin: env.ALLOWED_ORIGINS,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Send a ping every 25 s and wait 20 s for pong before disconnecting.
    // This keeps idle connections alive through NAT / load-balancer timeouts
    // and surfaces dead sockets quickly so we don't broadcast to ghosts.
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  // Register per-connection handlers for every new client
  io.on("connection", (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    registerCommentSocketHandlers(socket);
  });

  console.log("[Socket.IO] Server initialised");
  return io;
}

// ─── broadcast ────────────────────────────────────────────────────────────────

/**
 * Emits a persisted event to every connected Socket.IO client.
 *
 * Called exclusively from comment.service.ts, after createEvent() has
 * successfully written the event to MongoDB. This ordering guarantee means:
 *   - We never broadcast an event that wasn't persisted.
 *   - A client that missed the broadcast can always recover via sync{}
 *     because the event is already in the DB by the time it asks.
 *
 * If Socket.IO has not been initialised (e.g. in unit test environments that
 * don't call initSocket) this function silently skips the broadcast rather
 * than throwing, so service tests don't need to mock the socket layer.
 *
 * @param event  The full IEvent returned by EventService.createEvent()
 */
export function broadcast(event: IEvent): void {
  if (!io) {
    // Socket.IO not initialised — skip silently (test / non-WS environment)
    return;
  }

  const envelope: BroadcastEnvelope = {
    eventId: event.eventId,
    type: event.type,
    payload: event.payload,
  };

  // io.emit() delivers to every connected socket, including those in the
  // middle of a sync replay. Clients must deduplicate by eventId.
  io.emit(event.type, envelope);
}

// ─── getIO ────────────────────────────────────────────────────────────────────

/**
 * Returns the initialised Socket.IO Server instance.
 * Used by comment.socket.ts to send targeted messages back to individual
 * sockets during the sync{} catch-up flow.
 *
 * Throws if initSocket() has not been called — this is a programming error,
 * not a runtime error, so a hard throw is appropriate.
 */
export function getIO(): SocketServer {
  if (!io) {
    throw new Error(
      "[Socket.IO] getIO() called before initSocket(). Call initSocket(httpServer) in server.ts first."
    );
  }
  return io;
}
