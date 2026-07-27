import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { Request, Response } from "express";

const authenticatedKeyGenerator = (req: Request): string => {
  if (req.user) {
    return `user:${req.user._id.toString()}`;
  }

  return ipKeyGenerator(req.ip ?? "");
};

export const commentWriteRateLimit = rateLimit({
  windowMs: 3 * 1000,
  max: 1,
  keyGenerator: authenticatedKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: "Too many requests. Please wait 3 seconds before posting again.",
    });
  },
});

export const commentActionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: authenticatedKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: "Too many requests. Please try again shortly.",
    });
  },
});