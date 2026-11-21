import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import type { Config } from "./config.js";

const testConfig: Config = {
  PORT: 8080,
  GEMINI_API_KEY: "test-gemini-key",
  NVIDIA_API_KEY: "test-nvidia-key",
  ALLOWED_ORIGINS: ["http://localhost:5173", "https://app.example.com"],
};

describe("CORS behavior", () => {
  it("allows configured origin with Access-Control-Allow-Origin header", async () => {
    const app = createApp(testConfig);
    const response = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not set Access-Control-Allow-Origin header for disallowed origin and includes Origin in Vary header", async () => {
    const app = createApp(testConfig);
    const response = await request(app)
      .get("/api/health")
      .set("Origin", "https://unauthorized-domain.com");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers.vary).toBeDefined();
    expect(response.headers.vary).toContain("Origin");
  });

  it("allows requests with no Origin header and returns 200", async () => {
    const app = createApp(testConfig);
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
