import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import type { Profile } from "./profile.js";

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

interface StubFetchOptions {
  airBody?: unknown;
  llmResponse?: (url: string) => Response | Promise<Response>;
}

function stubFetch(options?: StubFetchOptions) {
  const airBody = options?.airBody ?? makeUpstreamAir();
  const llmResponse = options?.llmResponse;

  const openMeteoMock = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(airBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
  );

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("open-meteo.com")) {
      return openMeteoMock(input, init);
    }
    if (llmResponse) {
      return Promise.resolve(llmResponse(url));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ error: "LLM unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  return openMeteoMock;
}

const validFamilyProfile: Profile = {
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

const validCommunityProfile: Profile = {
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
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    const app = createApp(testConfig);

    const response = await request(app)
      .post("/api/plan")
      .send(validFamilyProfile);

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "UPSTREAM_ERROR",
        message: "Location and air quality data are temporarily unavailable",
      },
    });
  });

  it("with LLM mocked to succeed, response has generatedBy gemini, non-null narrative, and actions deep-equal to static run", async () => {
    const sampleNarrative = {
      summary: "Air quality requires care today. Reducing exposure protects health.",
      routine: [
        { period: "morning", advice: "Keep windows closed during early hours." },
      ],
      tips: [
        { title: "Filtration", detail: "Use an air purifier indoors." },
      ],
    };

    const app = createApp(testConfig);

    stubFetch();
    const staticResponse = await request(app)
      .post("/api/plan")
      .send(validFamilyProfile);
    expect(staticResponse.status).toBe(200);
    const staticBody = staticResponse.body;

    stubFetch({
      llmResponse: () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(sampleNarrative) }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        ),
    });

    const response = await request(app)
      .post("/api/plan")
      .send(validFamilyProfile);

    expect(response.status).toBe(200);
    expect(response.body.generatedBy).toBe("gemini");
    expect(response.body.narrative).toEqual(sampleNarrative);
    expect(response.body.actions).toEqual(staticBody.actions);
  });

  it("with both LLM hosts failing, returns 200 with generatedBy static and narrative null", async () => {
    stubFetch();
    const app = createApp(testConfig);

    const response = await request(app)
      .post("/api/plan")
      .send(validFamilyProfile);

    expect(response.status).toBe(200);
    expect(response.body.generatedBy).toBe("static");
    expect(response.body.narrative).toBeNull();
  });

  it("plan success has cache-control exactly no-store", async () => {
    stubFetch();
    const app = createApp(testConfig);
    const response = await request(app)
      .post("/api/plan")
      .send(validFamilyProfile);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("a plan request that returns 400 has no cache-control header", async () => {
    const app = createApp(testConfig);
    const response = await request(app)
      .post("/api/plan")
      .send({});

    expect(response.status).toBe(400);
    expect(response.headers["cache-control"]).toBeUndefined();
  });
});
