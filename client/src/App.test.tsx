import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("the waking message appears after 2 seconds with fake timers while health is pending", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {}))
    );

    render(<App />);

    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("status").textContent).toBe(
      "Waking the server, this can take up to 15 seconds."
    );
  });

  it("nothing shows after success", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ok", uptimeSeconds: 5 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("the unreachable message shows after failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network connection error"))
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "The server could not be reached."
      );
    });
  });
});
