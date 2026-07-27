import { Request, Response, NextFunction } from "express";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { verifyToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import { User } from "../models/user.model";

/**
 * Protects routes by verifying the Bearer JWT in the Authorization header.
 *
 * Flow:
 *  1. Extract the token from "Authorization: Bearer <token>"
 *  2. Verify signature + expiry
 *  3. Load the user from DB to confirm they still exist
 *  4. Attach the public user object to req.user for downstream handlers
 *
 * Why re-fetch from DB instead of trusting the JWT payload alone?
 * The JWT is valid for its full lifetime even if the account is deleted.
 * Fetching the user ensures deleted accounts can't access protected routes.
 */
export async function protect(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Authentication token missing", 401);
    }

    const token = authHeader.split(" ")[1];

    // Will throw JsonWebTokenError or TokenExpiredError on failure
    const payload = verifyToken(token);

    // Confirm the user in the token still exists in the database
    const user = await User.findById(payload.sub).lean();
    if (!user) {
      throw new AppError("The user belonging to this token no longer exists", 401);
    }

    // Attach safe public user data — never the password hash
    req.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    next();
  } catch (err) {
    // Translate JWT-specific errors into consistent AppErrors
    if (err instanceof TokenExpiredError) {
      next(new AppError("Token has expired, please log in again", 401));
    } else if (err instanceof JsonWebTokenError) {
      next(new AppError("Invalid token, please log in again", 401));
    } else {
      next(err);
    }
  }
}
