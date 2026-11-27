import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LocationSearch } from "./LocationSearch";
import { jsonResponse, stubFetch } from "./testUtils";

function makeBerlinPlace() {
  return {
    name: "Berlin",
    region: "Berlin",
    country: "Germany",
    latitude: 52.52,
    longitude: 13.405,
  };
}

function searchBerlin() {
  const input = screen.getByLabelText("Search location");
  fireEvent.change(input, { target: { value: "Berlin" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

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

  it("announces the result count in an aria-live region that exists before the search", async () => {
    const places = [
      makeBerlinPlace(),
      {
        name: "Berlin",
        region: "Connecticut",
        country: "United States",
        latitude: 41.62,
        longitude: -72.76,
      },
    ];
    stubFetch(jsonResponse({ results: places }));

    const { container } = render(<LocationSearch onSelect={vi.fn()} selected={null} />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.textContent).toBe("");

    searchBerlin();

    await waitFor(() => {
      expect(liveRegion?.textContent).toBe("2 places found.");
    });
  });

  it("with one place returned, the same element reads '1 place found.'", async () => {
    const places = [makeBerlinPlace()];
    stubFetch(jsonResponse({ results: places }));

    const { container } = render(<LocationSearch onSelect={vi.fn()} selected={null} />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.textContent).toBe("");

    searchBerlin();

    await waitFor(() => {
      expect(liveRegion?.textContent).toBe("1 place found.");
    });
  });

  it("empty or whitespace query does not trigger search", () => {
    const fetchMock = stubFetch(jsonResponse({ results: [] }));
    render(<LocationSearch onSelect={vi.fn()} selected={null} />);

    const input = screen.getByLabelText("Search location");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pressing enter in search input triggers search", async () => {
    const places = [
      {
        name: "Tokyo",
        region: "Tokyo",
        country: "Japan",
        latitude: 35.6762,
        longitude: 139.6503,
      },
    ];
    stubFetch(jsonResponse({ results: places }));
    render(<LocationSearch onSelect={vi.fn()} selected={null} />);

    const input = screen.getByLabelText("Search location");
    fireEvent.change(input, { target: { value: "Tokyo" } });
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.keyDown(input, { key: "Enter" });

    const placeButton = await screen.findByRole("button", {
      name: "Tokyo, Tokyo, Japan",
    });
    expect(placeButton).toBeDefined();
  });
});
