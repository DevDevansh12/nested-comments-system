import { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import { RegisterDto, LoginDto } from "../types/auth";

/**
 * POST /api/auth/register
 * Body: { username, email, password }
 * Returns the new user + JWT token.
 */
export const register = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const dto = req.body as RegisterDto;
    const result = await authService.register(dto);
    sendSuccess(res, result, 201, "Registration successful");
  }
);

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns the authenticated user + JWT token.
 */
export const login = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const dto = req.body as LoginDto;
    const result = await authService.login(dto);
    sendSuccess(res, result, 200, "Login successful");
  }
);

/**
 * GET /api/auth/me  [protected]
 * Returns the currently authenticated user's profile.
 * req.user is guaranteed to exist because the `protect` middleware runs first.
 */
export const getMe = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // req.user._id is set by the auth middleware — re-fetch for fresh data
    const user = await authService.getMe(req.user!._id.toString());
    sendSuccess(res, user, 200);
  }
);
