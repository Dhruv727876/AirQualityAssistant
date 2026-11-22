import { rateLimit } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "./errors.js";

const WINDOW_MS = 15 * 60 * 1000;

export function createLimiter(limit: number) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new AppError(429, "RATE_LIMITED", "Too many requests, please try again later"));
    },
  });
}
