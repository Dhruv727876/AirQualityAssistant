import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LocationSearch } from "./LocationSearch";
import { jsonResponse, stubFetch } from "./testUtils";

describe("LocationSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("results list and selection", async () => {
    const handleSelect = vi.fn();
    const places = [
      {
        name: "London",
        region: "England",
        country: "United Kingdom",
        latitude: 51.5074,
        longitude: -0.1278,
      },
    ];

    stubFetch(jsonResponse({ results: places }));

    render(<LocationSearch onSelect={handleSelect} selected={null} />);

    const input = screen.getByLabelText("Search location");
    fireEvent.change(input, { target: { value: "London" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    const placeButton = await screen.findByRole("button", {
      name: "London, England, United Kingdom",
    });
    expect(placeButton).toBeDefined();

    fireEvent.click(placeButton);

    expect(handleSelect).toHaveBeenCalledWith({
      name: "London",
      latitude: 51.5074,
      longitude: -0.1278,
    });
  });

  it("empty results", async () => {
    stubFetch(jsonResponse({ results: [] }));

    render(<LocationSearch onSelect={vi.fn()} selected={null} />);

    const input = screen.getByLabelText("Search location");
    fireEvent.change(input, { target: { value: "UnknownPlace" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      const liveRegion = screen.getByRole("status");
      expect(liveRegion.textContent).toBe("No places found.");
    });
  });

  it("failure message", async () => {
    stubFetch(Promise.reject(new Error("Network failed")));

    render(<LocationSearch onSelect={vi.fn()} selected={null} />);

    const input = screen.getByLabelText("Search location");
    fireEvent.change(input, { target: { value: "FailCity" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      const liveRegion = screen.getByRole("status");
      expect(liveRegion.textContent).toBe("Search failed. Try again.");
    });
  });
});
