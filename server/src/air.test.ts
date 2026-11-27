import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import { aqiBand } from "./aqiBand.js";
import { clearUpstreamCaches } from "./openMeteo.js";

const testConfig: Config = {
  PORT: 8080,
  GEMINI_API_KEY: "test-gemini-key",
  NVIDIA_API_KEY: "test-nvidia-key",
  ALLOWED_ORIGINS: ["http://localhost:5173"],
};

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeGeocodeBody() {
  return {
    results: [
      {
        id: 1,
        name: "Delhi",
        latitude: 28.65,
        longitude: 77.23,
      },
    ],
  };
}

function makeAirBody() {
  const times: string[] = [];
  const aqiList: number[] = [];
  const pm25List: number[] = [];
  for (let i = 0; i < 30; i++) {
    times.push(`2026-01-01T${String(i % 24).padStart(2, "0")}:00`);
    aqiList.push(50);
    pm25List.push(20);
  }
  return {
    current: {
      time: "2026-01-01T10:00",
      us_aqi: 55,
      pm2_5: 22,
      pm10: 40,
    },
    hourly: {
      time: times,
      us_aqi: aqiList,
      pm2_5: pm25List,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  clearUpstreamCaches();
});

describe("aqiBand", () => {
  it("maps boundary values to EPA AQI bands accurately", () => {
    expect(aqiBand(0)).toEqual({ label: "Good", level: 0 });
    expect(aqiBand(50)).toEqual({ label: "Good", level: 0 });
    expect(aqiBand(51)).toEqual({ label: "Moderate", level: 1 });
    expect(aqiBand(100)).toEqual({ label: "Moderate", level: 1 });
    expect(aqiBand(101)).toEqual({ label: "Unhealthy for Sensitive Groups", level: 2 });
    expect(aqiBand(150)).toEqual({ label: "Unhealthy for Sensitive Groups", level: 2 });
    expect(aqiBand(151)).toEqual({ label: "Unhealthy", level: 3 });
    expect(aqiBand(200)).toEqual({ label: "Unhealthy", level: 3 });
    expect(aqiBand(201)).toEqual({ label: "Very Unhealthy", level: 4 });
    expect(aqiBand(300)).toEqual({ label: "Very Unhealthy", level: 4 });
    expect(aqiBand(301)).toEqual({ label: "Hazardous", level: 5 });
    expect(aqiBand(null)).toBeNull();
  });
});

describe("GET /api/geocode", () => {
  it("maps fields and encodes query parameter in upstream URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeJsonResponse({
        results: [
          {
            id: 1,
            name: "Delhi",
            latitude: 28.65,
            longitude: 77.23,
            country: "India",
            admin1: "National Capital Territory of Delhi",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const app = createApp(testConfig);
    const response = await request(app).get("/api/geocode?q=Delhi");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      results: [
        {
          name: "Delhi",
          region: "National Capital Territory of Delhi",
          country: "India",
          latitude: 28.65,
          longitude: 77.23,
        },
      ],
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("name=Delhi");
  });

  it("returns empty results array when upstream omits results key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeJsonResponse({ generationtime_ms: 0.1 }))
    );

    const app = createApp(testConfig);
    const response = await request(app).get("/api/geocode?q=UnknownPlace");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ results: [] });
  });

  it("returns 400 and avoids upstream call when q is too short", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const app = createApp(testConfig);
    const response = await request(app).get("/api/geocode?q=a");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
    expect(response.body.error.message).toContain("q");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/air", () => {
  it("maps current air, band, and exactly the next 24 hourly entries", async () => {
    const times: string[] = [];
    const aqiList: number[] = [];
    const pm25List: number[] = [];

    // Generate 30 hourly timestamps: 2 past entries and 28 future entries
    for (let i = 0; i < 30; i++) {
      const day = i < 24 ? "01" : "02";
      const hour = String(i % 24).padStart(2, "0");
      times.push(`2026-01-${day}T${hour}:00`);
      aqiList.push(50 + i);
      pm25List.push(10.5 + i);
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeJsonResponse({
          current: {
            time: "2026-01-01T02:00",
            us_aqi: 55,
            pm2_5: 12.5,
            pm10: 22.0,
          },
          hourly: {
            time: times,
            us_aqi: aqiList,
            pm2_5: pm25List,
          },
        })
      )
    );

    const app = createApp(testConfig);
    const response = await request(app).get("/api/air?lat=28.61&lon=77.21");

    expect(response.status).toBe(200);
    expect(response.body.current).toEqual({
      time: "2026-01-01T02:00",
      usAqi: 55,
      pm25: 12.5,
      pm10: 22.0,
      band: { label: "Moderate", level: 1 },
    });

    expect(response.body.hourly).toHaveLength(24);
    expect(response.body.hourly[0]).toEqual({
      time: "2026-01-01T02:00",
      usAqi: 52,
      pm25: 12.5,
    });
  });

  it("returns 400 and avoids upstream call when lat is out of range", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const app = createApp(testConfig);
    const response = await request(app).get("/api/air?lat=91&lon=0");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
    expect(response.body.error.message).toContain("lat");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    { query: "lat=&lon=0", errorField: "lat" },
    { query: "lat=%20%20&lon=0", errorField: "lat" },
    { query: "lat=0&lon=", errorField: "lon" },
    { query: "lat=0&lon=%20%20", errorField: "lon" },
    { query: "lat=&lon=", errorField: undefined },
    { query: "lat=abc&lon=0", errorField: "lat" },
  ])(
    "returns 400 and avoids upstream call when coordinates are invalid: $query",
    async ({ query, errorField }) => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const app = createApp(testConfig);
      const response = await request(app).get(`/api/air?${query}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_INPUT");
      if (errorField) {
        expect(response.body.error.message).toContain(errorField);
      }
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );

  it("accepts explicit string '0' for coordinates", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeJsonResponse({
        current: {
          time: "2026-01-01T00:00",
          us_aqi: 20,
          pm2_5: 5.0,
          pm10: 10.0,
        },
        hourly: {
          time: ["2026-01-01T00:00"],
          us_aqi: [20],
          pm2_5: [5.0],
        },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const app = createApp(testConfig);
    const response = await request(app).get("/api/air?lat=0&lon=0");

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("latitude=0");
    expect(calledUrl).toContain("longitude=0");
  });

  it("preserves null pollutant values and sets band to null when usAqi is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeJsonResponse({
          current: {
            time: "2026-01-01T00:00",
            us_aqi: null,
            pm2_5: null,
            pm10: null,
          },
          hourly: {
            time: ["2026-01-01T00:00"],
            us_aqi: [null],
            pm2_5: [null],
          },
        })
      )
    );

    const app = createApp(testConfig);
    const response = await request(app).get("/api/air?lat=28.61&lon=77.21");

    expect(response.status).toBe(200);
    expect(response.body.current).toEqual({
      time: "2026-01-01T00:00",
      usAqi: null,
      pm25: null,
      pm10: null,
      band: null,
    });
    expect(response.body.hourly).toEqual([
      {
        time: "2026-01-01T00:00",
        usAqi: null,
        pm25: null,
      },
    ]);
  });
});

describe("Upstream failure handling", () => {
  it("maps upstream non-2xx response to 502 UPSTREAM_ERROR without leaking upstream text", async () => {
    const upstreamErrorPayload = "Internal server disaster at Open-Meteo";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(upstreamErrorPayload, {
          status: 500,
          statusText: "Internal Server Error",
        })
      )
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp(testConfig);
    const response = await request(app).get("/api/geocode?q=Delhi");
    consoleSpy.mockRestore();

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "UPSTREAM_ERROR",
        message: "Location and air quality data are temporarily unavailable",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(upstreamErrorPayload);
  });

  it("maps upstream schema validation failure to 502 UPSTREAM_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeJsonResponse({ unexpected: "corrupted response structure" })
      )
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp(testConfig);
    const response = await request(app).get("/api/air?lat=28.61&lon=77.21");
    consoleSpy.mockRestore();

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "UPSTREAM_ERROR",
        message: "Location and air quality data are temporarily unavailable",
      },
    });
  });

  it("maps network timeout or rejection to 502 UPSTREAM_ERROR without leaking error details", async () => {
    const timeoutError = new Error("Connection timed out after 5000ms");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutError));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp(testConfig);
    const response = await request(app).get("/api/geocode?q=Delhi");
    consoleSpy.mockRestore();

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "UPSTREAM_ERROR",
        message: "Location and air quality data are temporarily unavailable",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("Connection timed out");
  });

  it("geocode success has cache-control exactly public, max-age=3600", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeJsonResponse(makeGeocodeBody()))
    );

    const app = createApp(testConfig);
    const response = await request(app).get("/api/geocode?q=Delhi");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("air success has cache-control exactly public, max-age=300", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeJsonResponse(makeAirBody()))
    );

    const app = createApp(testConfig);
    const response = await request(app).get("/api/air?lat=28.6&lon=77.2");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("a geocode request that returns 400 has no cache-control header", async () => {
    const app = createApp(testConfig);
    const response = await request(app).get("/api/geocode?q=a");

    expect(response.status).toBe(400);
    expect(response.headers["cache-control"]).toBeUndefined();
  });

  it("two identical GET /api/geocode requests call fetch once", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeJsonResponse(makeGeocodeBody()));
    vi.stubGlobal("fetch", mockFetch);

    const app = createApp(testConfig);
    const res1 = await request(app).get("/api/geocode?q=Delhi");
    const res2 = await request(app).get("/api/geocode?q=Delhi");

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual(res1.body);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("two identical GET /api/air requests call fetch once", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeJsonResponse(makeAirBody()));
    vi.stubGlobal("fetch", mockFetch);

    const app = createApp(testConfig);
    const res1 = await request(app).get("/api/air?lat=28.6&lon=77.2");
    const res2 = await request(app).get("/api/air?lat=28.6&lon=77.2");

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual(res1.body);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed upstream call", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }))
      .mockResolvedValueOnce(makeJsonResponse(makeGeocodeBody()));
    vi.stubGlobal("fetch", mockFetch);

    const app = createApp(testConfig);
    const res1 = await request(app).get("/api/geocode?q=Delhi");
    const res2 = await request(app).get("/api/geocode?q=Delhi");
    consoleSpy.mockRestore();

    expect(res1.status).toBe(502);
    expect(res2.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
