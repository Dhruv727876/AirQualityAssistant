import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

export type ErrorCode =
  | "INTERNAL"
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED";

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function validateInput<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new AppError(
      400,
      "INVALID_INPUT",
      fields ? `Invalid input: ${fields}` : "Invalid input"
    );
  }
  return result.data;
}

function sendError(res: Response, status: number, code: ErrorCode, message: string): void {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

const parserErrors = new Map<unknown, { status: number; code: ErrorCode; message: string }>([
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
