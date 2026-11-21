import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import { aqiBand } from "./aqiBand.js";

const testConfig: Config = {
  PORT: 8080,
  GEMINI_API_KEY: "test-gemini-key",
  NVIDIA_API_KEY: "test-nvidia-key",
  ALLOWED_ORIGINS: ["http://localhost:5173"],
};

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
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps fields and encodes query parameter in upstream URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    globalThis.fetch = mockFetch;

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
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ generationtime_ms: 0.1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const app = createApp(testConfig);
    const response = await request(app).get("/api/geocode?q=UnknownPlace");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ results: [] });
  });

  it("returns 400 and avoids upstream call when q is too short", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const app = createApp(testConfig);
    const response = await request(app).get("/api/geocode?q=a");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
    expect(response.body.error.message).toContain("q");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/air", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps current air, band, and exactly the next 24 hourly entries", async () => {
    const times: string[] = [];
    const aqiList: number[] = [];
    const pm25List: number[] = [];

    // Generate 30 hourly timestamps: 2 past entries and 28 future entries
    for (let i = 0; i < 30; i++) {
      const hourStr = String(i).padStart(2, "0");
      times.push(`2026-01-01T${hourStr}:00`);
      aqiList.push(50 + i);
      pm25List.push(10.5 + i);
    }

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
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
    globalThis.fetch = mockFetch;

    const app = createApp(testConfig);
    const response = await request(app).get("/api/air?lat=91&lon=0");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
    expect(response.body.error.message).toContain("lat");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 and avoids upstream call when coordinates are blank or whitespace-only", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const app = createApp(testConfig);

    const emptyLatRes = await request(app).get("/api/air?lat=&lon=0");
    expect(emptyLatRes.status).toBe(400);
    expect(emptyLatRes.body.error.code).toBe("INVALID_INPUT");
    expect(emptyLatRes.body.error.message).toContain("lat");

    const whitespaceLatRes = await request(app).get("/api/air?lat=%20%20&lon=0");
    expect(whitespaceLatRes.status).toBe(400);
    expect(whitespaceLatRes.body.error.code).toBe("INVALID_INPUT");
    expect(whitespaceLatRes.body.error.message).toContain("lat");

    const emptyLonRes = await request(app).get("/api/air?lat=0&lon=");
    expect(emptyLonRes.status).toBe(400);
    expect(emptyLonRes.body.error.code).toBe("INVALID_INPUT");
    expect(emptyLonRes.body.error.message).toContain("lon");

    const whitespaceLonRes = await request(app).get("/api/air?lat=0&lon=%20%20");
    expect(whitespaceLonRes.status).toBe(400);
    expect(whitespaceLonRes.body.error.code).toBe("INVALID_INPUT");
    expect(whitespaceLonRes.body.error.message).toContain("lon");

    const emptyBothRes = await request(app).get("/api/air?lat=&lon=");
    expect(emptyBothRes.status).toBe(400);
    expect(emptyBothRes.body.error.code).toBe("INVALID_INPUT");

    const nonNumericRes = await request(app).get("/api/air?lat=abc&lon=0");
    expect(nonNumericRes.status).toBe(400);
    expect(nonNumericRes.body.error.code).toBe("INVALID_INPUT");
    expect(nonNumericRes.body.error.message).toContain("lat");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("accepts explicit string '0' for coordinates", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    globalThis.fetch = mockFetch;

    const app = createApp(testConfig);
    const response = await request(app).get("/api/air?lat=0&lon=0");

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("latitude=0");
    expect(calledUrl).toContain("longitude=0");
  });

  it("preserves null pollutant values and sets band to null when usAqi is null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
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
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps upstream non-2xx response to 502 UPSTREAM_ERROR without leaking upstream text", async () => {
    const upstreamErrorPayload = "Internal server disaster at Open-Meteo";
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(upstreamErrorPayload, {
        status: 500,
        statusText: "Internal Server Error",
      })
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
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ unexpected: "corrupted response structure" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
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
    globalThis.fetch = vi.fn().mockRejectedValue(timeoutError);

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
});
