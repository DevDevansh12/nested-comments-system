/**
 * server.ts — HTTP server lifecycle
 *
 * Responsibilities:
 *   1. Connect to MongoDB.
 *   2. Create the Node.js HTTP server from the Express app.
 *   3. Attach Socket.IO to that HTTP server.
 *   4. Start listening on the configured port.
 *   5. Handle graceful shutdown on SIGTERM / SIGINT.
 *   6. Handle uncaught exceptions / unhandled rejections as a last resort.
 *
 * Why http.createServer(app) instead of app.listen()?
 *   app.listen() is a convenience shortcut — internally it calls
 *   http.createServer(app).listen(). We need the raw http.Server reference
 *   to pass to Socket.IO's constructor, so we create it explicitly.
 *   Express routes are completely unaffected.
 */

import { createServer } from "http";
import app from "./app";
import { env } from "./config/env";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { initSocket } from "./sockets/socket";

let isShuttingDown = false;

async function startServer(): Promise<void> {
  // ── 1. Database ─────────────────────────────────────────────────────────────
  await connectDatabase();

  // ── 2. HTTP server ──────────────────────────────────────────────────────────
  // Create a raw Node.js HTTP server wrapping the Express application.
  // All existing Express middleware and routes work exactly as before.
  const httpServer = createServer(app);

  // ── 3. Socket.IO ────────────────────────────────────────────────────────────
  // Attach Socket.IO to the same HTTP server. This shares port and process
  // with Express — no second port needed. Socket.IO handles its own upgrade
  // from HTTP to WebSocket internally.
  initSocket(httpServer);

  // ── 4. Listen ───────────────────────────────────────────────────────────────
  httpServer.listen(env.PORT, () => {
    console.log(
      `[Server] Running in ${env.NODE_ENV} mode on http://localhost:${env.PORT}`
    );
    console.log(
      `[Server] Socket.IO available at ws://localhost:${env.PORT}`
    );
  });

  // ── 5. Graceful shutdown ────────────────────────────────────────────────────
  async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);

    // Stop accepting new HTTP and WebSocket connections
    httpServer.close(async () => {
      console.log("[Server] HTTP server closed");
      try {
        await disconnectDatabase();
        console.log("[Server] Shutdown complete");
        process.exit(0);
      } catch (err) {
        console.error("[Server] Error during shutdown:", err);
        process.exit(1);
      }
    });

    // Force-kill if graceful shutdown takes longer than 10 s
    setTimeout(() => {
      console.error("[Server] Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
  }

  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

  // ── 6. Safety net ───────────────────────────────────────────────────────────
  process.on("uncaughtException", (err: Error) => {
    console.error("[Server] Uncaught Exception:", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    console.error("[Server] Unhandled Rejection:", reason);
    process.exit(1);
  });
}

startServer().catch((err: Error) => {
  console.error("[Server] Failed to start:", err.message);
  process.exit(1);
});
