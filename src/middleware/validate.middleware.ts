import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { AppError } from "../utils/AppError";

/**
 * Runs after a chain of express-validator checks.
 *
 * Collects ALL validation errors from the request and throws a single 422
 * AppError so the client receives every failed field in one response rather
 * than discovering them one at a time.
 *
 * The first error message becomes the top-level `message` in the response
 * body. All messages (including the first) are forwarded in the `errors[]`
 * array so clients can map them back to individual fields.
 *
 * Example response body:
 *   {
 *     "success": false,
 *     "message": "Username is required",
 *     "errors": ["Username is required", "Password must be at least 8 characters"]
 *   }
 */
export function validate(req: Request, _res: Response, next: NextFunction): void {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    const messages = result.array().map((e) => e.msg as string);

    // Build an AppError carrying the first message as the summary.
    // We attach all messages via a custom property so error.middleware.ts
    // can forward them in the `errors` array of the response.
    const err = new AppError(messages[0], 422);
    (err as AppError & { validationErrors: string[] }).validationErrors = messages;
    next(err);
    return;
  }

  next();
}
