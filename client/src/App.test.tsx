import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { App } from "./App";
import { sampleProfile, samplePlan } from "./testData";
import { jsonResponse, stubFetchRoutes } from "./testUtils";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("the waking message appears after 2 seconds with fake timers while health is pending", () => {
    vi.useFakeTimers();
    stubFetchRoutes({
      "/api/health": () => new Promise(() => {}),
    });

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
    stubFetchRoutes({});

    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("the unreachable message shows after failure", async () => {
    stubFetchRoutes({
      "/api/health": () => Promise.reject(new Error("Network connection error")),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "The server could not be reached."
      );
    });
  });

  it("start → form → plan happy path", async () => {
    stubFetchRoutes({
      "/api/geocode": () =>
        jsonResponse({
          results: [
            {
              name: "Delhi",
              latitude: 28.61,
              longitude: 77.21,
              country: "India",
            },
          ],
        }),
      "/api/plan": () => jsonResponse(samplePlan),
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Plan for my family" }));

    expect(screen.getByText("This plan is for your household.")).toBeDefined();

    const locationInput = screen.getByLabelText("Search location");
    fireEvent.change(locationInput, { target: { value: "Delhi" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    const placeBtn = await screen.findByRole("button", { name: "Delhi, India" });
    fireEvent.click(placeBtn);

    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    await screen.findByRole("heading", {
      name: "Air is unhealthy; limit time outdoors and keep indoor air clean.",
    });
    expect(screen.getByText("Start over")).toBeDefined();
  });

  it("the 8-second hint appears and then clears", async () => {
    vi.useFakeTimers();

    let resolvePlan = (_res: Response): void => {};
    const planPromise = new Promise<Response>((resolve) => {
      resolvePlan = resolve;
    });

    stubFetchRoutes({
      "/api/plan": () => planPromise,
    });

    localStorage.setItem("air_quality_profile", JSON.stringify(sampleProfile));

    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Plan for my family" }));
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    const statusEl = screen.getByRole("status");
    expect(statusEl.textContent).toContain("Building your plan…");
    expect(statusEl.textContent).not.toContain("Still working");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(statusEl.textContent).toContain(
      "Still working. The wording step can take up to 20 seconds."
    );

    await act(async () => {
      resolvePlan(jsonResponse(samplePlan));
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "Air is unhealthy; limit time outdoors and keep indoor air clean.",
      })
    ).toBeDefined();
  });

  it("the NETWORK and RATE_LIMITED messages", async () => {
    let shouldRateLimit = false;

    stubFetchRoutes({
      "/api/plan": () => {
        if (shouldRateLimit) {
          return jsonResponse(
            {
              error: {
                code: "RATE_LIMITED",
                message: "Too many requests",
              },
            },
            429
          );
        }
        return Promise.reject(new Error("Failed to fetch"));
      },
    });

    localStorage.setItem("air_quality_profile", JSON.stringify(sampleProfile));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Plan for my family" }));
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    const alertEl = await screen.findByRole("alert");
    expect(alertEl.textContent).toBe("The server could not be reached.");

    shouldRateLimit = true;
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Too many requests. Wait a minute and try again."
      );
    });
  });

  it('"Start over" returns to the start screen', async () => {
    stubFetchRoutes({
      "/api/plan": () => jsonResponse(samplePlan),
    });

    localStorage.setItem("air_quality_profile", JSON.stringify(sampleProfile));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Plan for my family" }));
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    const startOverBtn = await screen.findByRole("button", { name: "Start over" });
    fireEvent.click(startOverBtn);

    expect(screen.getByRole("button", { name: "Plan for my family" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Plan for my community" })).toBeDefined();
  });

  it("renders printable title, print button, and triggers window.print", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    stubFetchRoutes({
      "/api/plan": () => jsonResponse(samplePlan),
    });

    localStorage.setItem("air_quality_profile", JSON.stringify(sampleProfile));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Plan for my family" }));
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    const printBtn = await screen.findByRole("button", { name: "Print plan" });
    expect(printBtn).toBeDefined();

    expect(screen.getByText("Clean Air Plan for Delhi")).toBeDefined();

    fireEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("renders skip to main content link targeting main", () => {
    stubFetchRoutes({});
    render(<App />);

    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink).toBeDefined();
    expect(skipLink.getAttribute("href")).toBe("#main");

    const mainEl = screen.getByRole("main");
    expect(mainEl.getAttribute("id")).toBe("main");
  });

  it("focuses the plan region when a plan is rendered", async () => {
    stubFetchRoutes({
      "/api/plan": () => jsonResponse(samplePlan),
    });

    localStorage.setItem("air_quality_profile", JSON.stringify(sampleProfile));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Plan for my family" }));
    fireEvent.click(screen.getByRole("button", { name: "Get air quality plan" }));

    const planRegion = await screen.findByRole("region", {
      name: "Your air quality plan",
    });
    expect(document.activeElement).toBe(planRegion);
  });
});
