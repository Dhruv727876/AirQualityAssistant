import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("parses valid environment variables with default port", () => {
    const env = {
      GEMINI_API_KEY: "gemini-secret-key",
      NVIDIA_API_KEY: "nvidia-secret-key",
      ALLOWED_ORIGINS: "http://localhost:5173, https://app.example.com",
    };

    const config = loadConfig(env);

    expect(config).toEqual({
      PORT: 8080,
      GEMINI_API_KEY: "gemini-secret-key",
      NVIDIA_API_KEY: "nvidia-secret-key",
      ALLOWED_ORIGINS: ["http://localhost:5173", "https://app.example.com"],
    });
  });

  it("parses valid custom PORT", () => {
    const env = {
      PORT: "3000",
      GEMINI_API_KEY: "gemini-secret-key",
      NVIDIA_API_KEY: "nvidia-secret-key",
      ALLOWED_ORIGINS: "http://localhost:5173",
    };

    const config = loadConfig(env);
    expect(config.PORT).toBe(3000);
  });

  it("handles unset PORT with default 8080", () => {
    const env = {
      GEMINI_API_KEY: "gemini-secret-key",
      NVIDIA_API_KEY: "nvidia-secret-key",
      ALLOWED_ORIGINS: "http://localhost:5173",
    };

    const config = loadConfig(env);
    expect(config.PORT).toBe(8080);
  });

  it("throws descriptive error naming PORT when PORT is not a number", () => {
    const env = {
      PORT: "abc",
      GEMINI_API_KEY: "gemini-secret-key",
      NVIDIA_API_KEY: "nvidia-secret-key",
      ALLOWED_ORIGINS: "http://localhost:5173",
    };

    expect(() => loadConfig(env)).toThrowError(/PORT/);
  });

  it("throws descriptive error naming PORT when PORT is out of range", () => {
    const env = {
      PORT: "70000",
      GEMINI_API_KEY: "gemini-secret-key",
      NVIDIA_API_KEY: "nvidia-secret-key",
      ALLOWED_ORIGINS: "http://localhost:5173",
    };

    expect(() => loadConfig(env)).toThrowError(/PORT/);
  });

  it("does not require NODE_ENV", () => {
    const env = {
      GEMINI_API_KEY: "gemini-secret-key",
      NVIDIA_API_KEY: "nvidia-secret-key",
      ALLOWED_ORIGINS: "http://localhost:5173",
    };

    const config = loadConfig(env);
    expect(config.PORT).toBe(8080);
  });

  it("throws descriptive error naming every missing required variable", () => {
    const env = {};

    expect(() => loadConfig(env)).toThrowError(
      /(?=.*GEMINI_API_KEY)(?=.*NVIDIA_API_KEY)(?=.*ALLOWED_ORIGINS)/
    );
  });

  it("throws descriptive error on invalid origin in ALLOWED_ORIGINS", () => {
    const env = {
      GEMINI_API_KEY: "gemini-secret-key",
      NVIDIA_API_KEY: "nvidia-secret-key",
      ALLOWED_ORIGINS: "not-a-valid-origin",
    };

    expect(() => loadConfig(env)).toThrowError(/ALLOWED_ORIGINS/);
  });
});
