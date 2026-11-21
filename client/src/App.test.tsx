import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders pending state then ready state upon successful health check", async () => {
    let resolveHealth = (_value: Response): void => {};
    const healthPromise = new Promise<Response>((resolve) => {
      resolveHealth = resolve;
    });

    globalThis.fetch = vi.fn().mockReturnValue(healthPromise);

    render(<App />);

    expect(screen.getByRole("status").textContent).toContain("Connecting to server");

    resolveHealth(
      new Response(JSON.stringify({ status: "ok", uptimeSeconds: 5 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Server ready")).toBeTruthy();
    });
  });

  it("renders clear failure message when server check fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection error"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Network connection error");
    });
  });
});
