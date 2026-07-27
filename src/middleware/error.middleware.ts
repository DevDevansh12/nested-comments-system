import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { ApiResponse } from "../types/api";

/**
 * Global Express error handler — must have exactly 4 parameters.
 *
 * Handles two categories:
 *   1. AppError (operational) — known errors thrown intentionally by services
 *      and middleware. Returned as-is with their status code.
 *      If the error carries a `validationErrors` array (set by validate.middleware)
 *      those are forwarded in the `errors` field so clients see all failures.
 *
 *   2. Everything else (programmer errors / unexpected crashes) — logged and
 *      returned as 500. Stack trace is included only in development mode so
 *      internals are never exposed in production.
 */
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    // Check if this error was enriched with validation details
    const validationErrors = (err as AppError & { validationErrors?: string[] })
      .validationErrors;

    const body: ApiResponse = {
      success: false,
      message: err.message,
      ...(validationErrors && validationErrors.length > 0
        ? { errors: validationErrors }
        : {}),
    };

    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected error — always log the full stack server-side
  console.error("[Unhandled Error]", err);

  const body: ApiResponse = {
    success: false,
    message: env.isProd() ? "Internal server error" : err.message,
    ...(env.isDev() && { errors: [err.stack ?? ""] }),
  };

  res.status(500).json(body);
}
