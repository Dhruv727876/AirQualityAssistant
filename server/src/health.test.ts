import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import { AppError, errorHandler } from "./errors.js";

const testConfig: Config = {
  NODE_ENV: "test",
  PORT: 8081,
  GEMINI_API_KEY: "test-gemini-key",
  NVIDIA_API_KEY: "test-nvidia-key",
  ALLOWED_ORIGINS: ["http://localhost:5173"],
};

describe("Health API", () => {
  it("returns ok payload with uptime", async () => {
    const app = createApp(testConfig);
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(typeof response.body.uptimeSeconds).toBe("number");
    expect(Number.isInteger(response.body.uptimeSeconds)).toBe(true);
  });

  it("enforces strict Content-Security-Policy without unsafe-inline", async () => {
    const app = createApp(testConfig);
    const response = await request(app).get("/api/health");

    expect(response.headers["content-security-policy"]).toBe(
      "default-src 'none';frame-ancestors 'none'"
    );
    expect(response.headers["content-security-policy"]).not.toContain("unsafe-inline");
  });

  it("returns 404 with standardized error payload for unknown routes", async () => {
    const app = createApp(testConfig);
    const response = await request(app).get("/api/nope");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
  });

  it("formats non-AppError as 500 INTERNAL with generic message", async () => {
    const app = express();
    app.get("/crash", () => {
      throw new Error("Simulated unexpected failure");
    });
    app.use(errorHandler);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await request(app).get("/crash");
    consoleSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL",
        message: "An unexpected error occurred",
      },
    });
  });

  it("uses code as default message when AppError message is omitted", () => {
    const error = new AppError(400, "BAD_REQUEST");
    expect(error.message).toBe("BAD_REQUEST");
    expect(error.status).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
  });
});
