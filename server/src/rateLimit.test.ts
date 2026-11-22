import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import type { Config } from "./config.js";

const testConfig: Config = {
  PORT: 8080,
  GEMINI_API_KEY: "test-gemini-key",
  NVIDIA_API_KEY: "test-nvidia-key",
  ALLOWED_ORIGINS: ["http://localhost:5173"],
};

describe("Rate limiting middleware", () => {
  it("limits /api/plan to 30 requests and returns 429 on the 31st", async () => {
    const app = createApp(testConfig);

    for (let i = 0; i < 30; i++) {
      const res = await request(app).post("/api/plan").send({});
      expect(res.status).toBe(400);
    }

    const blockedRes = await request(app).post("/api/plan").send({});
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests, please try again later",
      },
    });
  });

  it("limits global requests to 100 and returns 429 on the 101st", async () => {
    const app = createApp(testConfig);

    for (let i = 0; i < 100; i++) {
      const res = await request(app).get("/api/geocode?q=a");
      expect(res.status).toBe(400);
    }

    const blockedRes = await request(app).get("/api/geocode?q=a");
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests, please try again later",
      },
    });
  });

  it("exempts /api/health from rate limiting across 120 requests", async () => {
    const app = createApp(testConfig);

    for (let i = 0; i < 120; i++) {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
    }
  });
});
