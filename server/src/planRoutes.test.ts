import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import type { Config } from "./config.js";

const testConfig: Config = {
  PORT: 8080,
  GEMINI_API_KEY: "test-gemini-key",
  NVIDIA_API_KEY: "test-nvidia-key",
  ALLOWED_ORIGINS: ["http://localhost:5173"],
};

function makeUpstreamAir() {
  const times: string[] = [];
  const aqiList: number[] = [];
  const pm25List: number[] = [];

  for (let day = 1; day <= 2; day++) {
    const dayStr = String(day).padStart(2, "0");
    for (let h = 0; h < 24; h++) {
      const hourStr = String(h).padStart(2, "0");
      times.push(`2026-01-${dayStr}T${hourStr}:00`);
      aqiList.push(50 + h);
      pm25List.push(20 + h);
    }
  }

  return {
    current: {
      time: "2026-01-01T10:00",
      us_aqi: 180,
      pm2_5: 110,
      pm10: 150,
    },
    hourly: {
      time: times,
      us_aqi: aqiList,
      pm2_5: pm25List,
    },
  };
}

function stubFetch(body = makeUpstreamAir()) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const validFamilyProfile = {
  mode: "family",
  location: { name: "Central Park", latitude: 40.78, longitude: -73.96 },
  members: { adults: 2, children: 1, elderly: 0 },
  hasSensitiveMember: false,
  commute: { mode: "car", oneWayKm: 15, daysPerWeek: 5 },
  heating: "electric",
  cooking: "gas",
  roomAreaM2: 25,
  purifierCadrM3PerHour: 250,
};

const validCommunityProfile = {
  mode: "community",
  households: 50,
  location: { name: "Green Heights", latitude: 28.61, longitude: 77.2 },
  commute: { mode: "car", oneWayKm: 10, daysPerWeek: 5 },
  heating: "none",
  cooking: "electric",
  roomAreaM2: 50,
  hasSensitiveMember: false,
};

describe("POST /api/plan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles valid family profile with status 200 and static plan", async () => {
    const fetchMock = stubFetch();
    const app = createApp(testConfig);

    const response = await request(app)
      .post("/api/plan")
      .send(validFamilyProfile);

    expect(response.status).toBe(200);
    expect(response.body.generatedBy).toBe("static");
    expect(response.body.verdict.level).toBe("limit-outdoors");
    expect(
      response.body.actions.some((a: { id: string }) => a.id === "n95-outdoors")
    ).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("latitude=40.78");
    expect(calledUrl).toContain("longitude=-73.96");
  });

  it("handles valid community profile scaling avoid-car-trips to 5000", async () => {
    stubFetch();
    const app = createApp(testConfig);

    const response = await request(app)
      .post("/api/plan")
      .send(validCommunityProfile);

    expect(response.status).toBe(200);
    const avoidCarAction = response.body.actions.find(
      (a: { id: string }) => a.id === "avoid-car-trips"
    );
    expect(avoidCarAction?.impact?.value).toBe(5000);
  });

  it.each([
    { name: "empty object", body: {} },
    {
      name: "unknown extra key",
      body: { ...validFamilyProfile, unexpectedKey: "not-allowed" },
    },
    {
      name: "latitude out of range (91)",
      body: {
        ...validFamilyProfile,
        location: { ...validFamilyProfile.location, latitude: 91 },
      },
    },
    { name: "no body at all", body: undefined },
  ])("rejects invalid input with 400 INVALID_INPUT without calling fetch: $name", async ({ body }) => {
    const fetchMock = stubFetch();
    const app = createApp(testConfig);

    const req = request(app).post("/api/plan");
    const response = body !== undefined ? await req.send(body) : await req;

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never includes submitted profile values in error responses for privacy", async () => {
    const fetchMock = stubFetch();
    const app = createApp(testConfig);

    const response = await request(app).post("/api/plan").send({
      ...validFamilyProfile,
      location: {
        name: "SECRET-NAME-123",
        latitude: 91,
        longitude: 77.2,
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_INPUT");
    expect(response.text).not.toContain("SECRET-NAME-123");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps upstream rejection to 502 UPSTREAM_ERROR in standard envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failed")));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp(testConfig);

    const response = await request(app)
      .post("/api/plan")
      .send(validFamilyProfile);

    consoleSpy.mockRestore();

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "UPSTREAM_ERROR",
        message: "Location and air quality data are temporarily unavailable",
      },
    });
  });
});
