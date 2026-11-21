import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express identifies an error-handling middleware by its 4-parameter signature
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  console.error("Internal server error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL",
      message: "An unexpected error occurred",
    },
  });
}

