import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ApiError,
  getHealth,
  searchLocations,
  createPlan,
  type Plan,
} from "./api";
import type { Profile } from "./profile";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(response: Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleProfile: Profile = {
    mode: "family",
    location: {
      name: "Delhi",
      latitude: 28.61,
      longitude: 77.21,
    },
    commute: {
      mode: "car",
      oneWayKm: 10,
      daysPerWeek: 5,
    },
    heating: "electric",
    cooking: "gas",
    roomAreaM2: 20,
    hasSensitiveMember: true,
    members: {
      adults: 2,
      children: 1,
      elderly: 1,
    },
  };

  const samplePlan: Plan = {
    generatedBy: "static",
    narrative: {
      summary: "Air quality requires care today. Reducing exposure protects health.",
      routine: [
        { period: "morning", advice: "Keep windows closed during peak morning traffic." },
      ],
      tips: [
        { title: "Indoor Plants", detail: "Plants do not replace ventilation or air purifiers." },
      ],
    },
    air: {
      time: "2026-01-10T10:00",
      usAqi: 228,
      pm25: 120,
      band: { label: "Very Unhealthy", level: 4 },
      whoRatio: 8,
    },
    verdict: {
      level: "limit-outdoors",
      headline: "Air is unhealthy; limit time outdoors and keep indoor air clean.",
      note: null,
    },
    hours: {
      best: { time: "2026-01-10T14:00", pm25: 45 },
      worst: { time: "2026-01-10T08:00", pm25: 150 },
    },
    actions: [
      {
        id: "n95-outdoors",
        title: "Wear an N95 outdoors",
        detail: "Fit tightly over mouth and nose.",
        because: "Air is unhealthy",
        impact: {
          lever: "n95-outdoors",
          value: 0.95,
          unit: "ratio",
          basis: "standard",
          assumptions: ["Proper fit"],
        },
      },
      {
        id: "air-purifier",
        title: "Run the purifier",
        detail: "Keep running in occupied room.",
        because: "Indoor air needs cleaning",
        impact: null,
      },
    ],
    disclaimer: "General information, not medical advice.",
  };

  it("a valid plan parses", async () => {
    stubFetch(jsonResponse(samplePlan));

    const plan = await createPlan(sampleProfile);
    expect(plan).toEqual(samplePlan);
  });

  it("a plan with a wrong shape throws BAD_RESPONSE", async () => {
    stubFetch(jsonResponse({ unexpected: "data" }));

    await expect(createPlan(sampleProfile)).rejects.toMatchObject({
      code: "BAD_RESPONSE",
    });
  });

  it("a server error envelope maps to its code", async () => {
    stubFetch(
      jsonResponse(
        {
          error: {
            code: "INVALID_INPUT",
            message: "Invalid profile data",
          },
        },
        400
      )
    );

    await expect(createPlan(sampleProfile)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Invalid profile data",
    });
  });

  it("a non-envelope 500 maps to UPSTREAM", async () => {
    stubFetch(new Response("Internal Server Error", { status: 500 }));

    await expect(getHealth()).rejects.toMatchObject({
      code: "UPSTREAM",
    });
  });

  it("a rejected fetch maps to NETWORK", async () => {
    stubFetch(Promise.reject(new Error("Network connection dropped")));

    await expect(getHealth()).rejects.toMatchObject({
      code: "NETWORK",
      message: "Network connection dropped",
    });
  });

  it("a fetch rejecting with an AbortError rejects with name AbortError and is not an ApiError", async () => {
    stubFetch(Promise.reject(new DOMException("aborted", "AbortError")));

    let thrown: unknown = null;
    try {
      await getHealth();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toMatchObject({ name: "AbortError" });
    expect(thrown instanceof ApiError).toBe(false);
  });

  it("searchLocations parses a result list and an empty one", async () => {
    const placesResponse = {
      results: [
        {
          name: "London",
          latitude: 51.5074,
          longitude: -0.1278,
          country: "United Kingdom",
          region: "England",
        },
      ],
    };

    stubFetch(jsonResponse(placesResponse));

    const found = await searchLocations("London");
    expect(found.results).toEqual(placesResponse.results);

    stubFetch(jsonResponse({ results: [] }));

    const empty = await searchLocations("Nowhere");
    expect(empty.results).toEqual([]);
  });

  it("the request URL contains the encoded query", async () => {
    const fetchMock = stubFetch(jsonResponse({ results: [] }));

    await searchLocations("New York & London");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("q=New%20York%20%26%20London"),
      expect.anything()
    );
  });

  it("createPlan sends a JSON body with a Content-Type header", async () => {
    const fetchMock = stubFetch(jsonResponse(samplePlan));

    await createPlan(sampleProfile);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/plan"),
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sampleProfile),
      })
    );
  });
});
