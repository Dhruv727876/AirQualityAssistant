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

describe("Error handling middleware", () => {
  it("maps malformed JSON body to 400 BAD_REQUEST", async () => {
    const app = createApp(testConfig);
    const response = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Malformed JSON body",
      },
    });
  });

  it("maps body over 10kb limit to 413 PAYLOAD_TOO_LARGE", async () => {
    const app = createApp(testConfig);
    const largeBody = JSON.stringify({ data: "x".repeat(11 * 1024) });
    const response = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send(largeBody);

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request payload too large",
      },
    });
  });
});
