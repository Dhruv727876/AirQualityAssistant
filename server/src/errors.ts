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

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

const parserErrors = new Map<unknown, { status: number; code: string; message: string }>([
  ["entity.parse.failed", { status: 400, code: "BAD_REQUEST", message: "Malformed JSON body" }],
  ["entity.too.large", { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request payload too large" }],
]);

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express identifies an error-handling middleware by its 4-parameter signature
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }

  if (typeof err === "object" && err !== null && "type" in err) {
    const parserError = parserErrors.get(err.type);
    if (parserError) {
      sendError(res, parserError.status, parserError.code, parserError.message);
      return;
    }
  }

  console.error("Internal server error:", err);
  sendError(res, 500, "INTERNAL", "An unexpected error occurred");
}
