import express, { Application } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { loggerMiddleware } from "./middleware/logger.middleware";
import { notFoundMiddleware } from "./middleware/notFound.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
import apiRoutes from "./routes";

const app: Application = express();

// ─── Security ─────────────────────────────────────────────
app.use(helmet());

app.use(
  cors({
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── Performance ──────────────────────────────────────────
app.use(compression());

// ─── Body / Cookie parsing ────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser(env.COOKIE_SECRET));

// ─── HTTP request logging ─────────────────────────────────
app.use(loggerMiddleware);

// ─── Health check ─────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", env: env.NODE_ENV });
});

// ─── API routes ───────────────────────────────────────────
app.use("/api/v1", apiRoutes);

// ─── 404 handler ──────────────────────────────────────────
app.use(notFoundMiddleware);

// ─── Global error handler ────────────────────────────────
// Must be last and must have 4 parameters (err, req, res, next)
app.use(errorMiddleware);

export default app;
