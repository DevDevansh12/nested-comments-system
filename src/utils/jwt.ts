import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { JwtPayload } from "../types/auth";

/**
 * Signs a new JWT containing the minimal payload needed to identify a user.
 * Expiry is controlled by the JWT_EXPIRES_IN env var (default: 7d).
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Verifies a JWT string and returns the decoded payload.
 * Throws a JsonWebTokenError / TokenExpiredError on failure —
 * both are caught and re-thrown as AppErrors by the auth middleware.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
