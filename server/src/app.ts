import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import type { Config } from "./config.js";
import { AppError, errorHandler } from "./errors.js";
import { airRouter } from "./airRoutes.js";
import { planRouter } from "./planRoutes.js";
import { createLimiter } from "./rateLimit.js";

const GENERAL_LIMIT = 100;
const PLAN_LIMIT = 30;

export function createApp(config: Config): Express {
  const app = express();

  // Render sits behind a reverse proxy; required for accurate client IP identification in rate limiting
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    })
  );

  app.use(cors({ origin: config.ALLOWED_ORIGINS }));

  app.use(compression());
  app.use(express.json({ limit: "10kb" }));

  app.use(createLimiter(GENERAL_LIMIT));

  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.use("/api", airRouter);

  app.use("/api/plan", createLimiter(PLAN_LIMIT));
  app.use("/api", planRouter);

  app.use((_req, _res, next) => {
    next(new AppError(404, "NOT_FOUND", "Route not found"));
  });

  app.use(errorHandler);

  return app;
}
