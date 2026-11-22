import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { generateNarrative, type LlmKeys } from "./llm.js";
import type { Profile } from "./profile.js";
import type { Plan } from "./plan.js";
import type { Narrative } from "./narrative.js";

const keys: LlmKeys = {
  GEMINI_API_KEY: "test-gemini-key",
  NVIDIA_API_KEY: "test-nvidia-key",
};

const sampleNarrative: Narrative = {
  summary:
    "Air quality needs care today. Minimise prolonged outdoor activity to reduce exposure to fine particles.",
  routine: [
    {
      period: "morning",
      advice: "Keep windows closed during early hours when fine particles peak.",
    },
    {
      period: "afternoon",
      advice: "Ventilate briefly in the afternoon if air improves.",
    },
  ],
  tips: [
    {
      title: "Indoor filtration",
      detail: "Run an air purifier in main rooms to lower particulate concentrations.",
    },
  ],
};

const familyProfile: Profile = {
  mode: "family",
  location: { name: "Safeville", latitude: 28.6139, longitude: 77.209 },
  members: { adults: 2, children: 1, elderly: 0 },
  hasSensitiveMember: false,
  commute: { mode: "car", oneWayKm: 12, daysPerWeek: 5 },
  heating: "electric",
  cooking: "gas",
  roomAreaM2: 30,
  purifierCadrM3PerHour: 250,
};

const communityProfile: Profile = {
  mode: "community",
  households: 45,
  location: { name: "Green Heights", latitude: 12.9716, longitude: 77.5946 },
  commute: { mode: "car", oneWayKm: 10, daysPerWeek: 5 },
  heating: "none",
  cooking: "electric",
  roomAreaM2: 60,
  hasSensitiveMember: true,
};

const samplePlan: Plan = {
  generatedBy: "static",
  narrative: null,
  air: {
    time: "2026-01-01T10:00",
    usAqi: 155,
    pm25: 65,
    band: { label: "Unhealthy", level: 3 },
    whoRatio: 4.3,
  },
  verdict: {
    level: "limit-outdoors",
    headline: "Air quality is unhealthy: limit outdoor exposure",
    note: null,
  },
  hours: {
    best: { time: "2026-01-01T14:00", pm25: 45 },
    worst: { time: "2026-01-01T08:00", pm25: 90 },
  },
  actions: [
    {
      id: "n95-outdoors",
      title: "Wear an N95 mask outdoors",
      detail: "Wear a well-fitted mask.",
      because: "Air is unhealthy",
      impact: null,
    },
  ],
  disclaimer: "Informational only.",
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function stubProviders(handlers: { gemini: Handler; nvidia: Handler }) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(handlers.gemini(init));
    }
    if (url.includes("integrate.api.nvidia.com")) {
      return Promise.resolve(handlers.nvidia(init));
    }
    throw new Error(`Unexpected request to ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeGeminiSuccess(narrative: unknown = sampleNarrative) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(narrative) }],
        },
      },
    ],
  };
}

function makeNvidiaSuccess(narrative: unknown = sampleNarrative) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify(narrative),
        },
      },
    ],
  };
}

const happyProviders = {
  gemini: () => makeJsonResponse(makeGeminiSuccess()),
  nvidia: () => makeJsonResponse(makeNvidiaSuccess()),
};

function extractHeaders(init?: RequestInit): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers));
}

function loggedText(): string {
  return vi
    .mocked(console.error)
    .mock.calls.map((call) => call.map((arg) => String(arg)).join(" "))
    .join("\n");
}

function sentBody(fetchMock: ReturnType<typeof stubProviders>, callIndex = 0): string {
  const init = fetchMock.mock.calls[callIndex]?.[1];
  return typeof init?.body === "string" ? init.body : "";
}

describe("generateNarrative", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns provider gemini when Gemini succeeds, asserting model, header, and key absence in URL", async () => {
    const fetchMock = stubProviders(happyProviders);

    const result = await generateNarrative(familyProfile, samplePlan, keys);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("gemini");
    expect(result?.narrative).toEqual(sampleNarrative);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("gemini-3.1-flash-lite");
    expect(calledUrl).not.toContain("test-gemini-key");

    const headers = extractHeaders(fetchMock.mock.calls[0]?.[1]);
    expect(headers["x-goog-api-key"]).toBe("test-gemini-key");
  });

  it("falls through to NVIDIA when Gemini returns HTTP 500, asserting Bearer header", async () => {
    const fetchMock = stubProviders({
      gemini: () => new Response("Internal Server Error", { status: 500 }),
      nvidia: () => makeJsonResponse(makeNvidiaSuccess()),
    });

    const result = await generateNarrative(familyProfile, samplePlan, keys);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("nvidia");
    expect(result?.narrative).toEqual(sampleNarrative);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const headers = extractHeaders(fetchMock.mock.calls[1]?.[1]);
    expect(headers["authorization"]).toBe("Bearer test-nvidia-key");

    const reqBody = JSON.parse(sentBody(fetchMock, 1));
    expect(reqBody.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(reqBody.chat_template_kwargs?.enable_thinking).toBe(false);
  });

  it("falls through to NVIDIA when Gemini returns a narrative containing digits", async () => {
    const narrativeWithDigits = {
      summary: "Air quality index is 150 today.",
      routine: sampleNarrative.routine,
      tips: sampleNarrative.tips,
    };

    const fetchMock = stubProviders({
      gemini: () => makeJsonResponse(makeGeminiSuccess(narrativeWithDigits)),
      nvidia: () => makeJsonResponse(makeNvidiaSuccess()),
    });

    const result = await generateNarrative(familyProfile, samplePlan, keys);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("nvidia");
    expect(result?.narrative).toEqual(sampleNarrative);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls through to NVIDIA when Gemini encounters a network error (rejected fetch)", async () => {
    const fetchMock = stubProviders({
      gemini: () => Promise.reject(new Error("Connection reset")),
      nvidia: () => makeJsonResponse(makeNvidiaSuccess()),
    });

    const result = await generateNarrative(familyProfile, samplePlan, keys);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("nvidia");
    expect(result?.narrative).toEqual(sampleNarrative);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when both providers fail", async () => {
    const fetchMock = stubProviders({
      gemini: () => new Response("Failed", { status: 502 }),
      nvidia: () => new Response("Failed", { status: 502 }),
    });

    const result = await generateNarrative(familyProfile, samplePlan, keys);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves privacy: request body contains location name but never latitude or longitude", async () => {
    const fetchMock = stubProviders(happyProviders);

    await generateNarrative(familyProfile, samplePlan, keys);

    const body = sentBody(fetchMock, 0);
    expect(body).toContain("Safeville");
    expect(body).not.toContain("28.6139");
    expect(body).not.toContain("77.209");
  });

  it("never logs location name or API keys to console.error during failures", async () => {
    stubProviders({
      gemini: () => new Response("Service Unavailable", { status: 503 }),
      nvidia: () => new Response("Service Unavailable", { status: 503 }),
    });

    await generateNarrative(familyProfile, samplePlan, keys);

    const log = loggedText();
    expect(log).toContain("LLM provider failed");
    expect(log).not.toContain("Safeville");
    expect(log).not.toContain("test-gemini-key");
    expect(log).not.toContain("test-nvidia-key");
  });

  it("formats community profile and null airBand in payload correctly", async () => {
    const fetchMock = stubProviders(happyProviders);

    const planWithNullBand: Plan = {
      ...samplePlan,
      air: {
        ...samplePlan.air,
        band: null,
      },
    };

    const result = await generateNarrative(communityProfile, planWithNullBand, keys);

    expect(result?.provider).toBe("gemini");
    const body = sentBody(fetchMock, 0);
    expect(body).toContain("Green Heights");
    const req = JSON.parse(body);
    const payload = JSON.parse(req.contents[0].parts[0].text);
    expect(payload.DATA.households).toBe(45);
    expect(body).toContain('\\"airBand\\":null');
  });

  it("fails NVIDIA when content is null, logging empty content once, without affecting Gemini success", async () => {
    const nullContentNvidia = {
      choices: [
        {
          finish_reason: "length",
          message: {
            content: null,
            reasoning_content: "thinking...",
          },
        },
      ],
    };

    const fetchMockFail = stubProviders({
      gemini: () => new Response("Internal Server Error", { status: 500 }),
      nvidia: () => makeJsonResponse(nullContentNvidia),
    });

    const failResult = await generateNarrative(familyProfile, samplePlan, keys);
    expect(failResult).toBeNull();
    expect(fetchMockFail).toHaveBeenCalledTimes(2);

    const log = loggedText();
    expect(log).toContain("LLM provider failed nvidia empty content");
    expect(log.split("empty content").length - 1).toBe(1);

    const fetchMockSuccess = stubProviders(happyProviders);
    const successResult = await generateNarrative(familyProfile, samplePlan, keys);
    expect(successResult?.provider).toBe("gemini");
    expect(successResult?.narrative).toEqual(sampleNarrative);
  });

  it("parses Gemini response when single part contains thoughtSignature alongside text", async () => {
    const fetchMock = stubProviders({
      gemini: () =>
        makeJsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(sampleNarrative),
                    thoughtSignature: "x",
                  },
                ],
              },
            },
          ],
        }),
      nvidia: () => makeJsonResponse(makeNvidiaSuccess()),
    });

    const result = await generateNarrative(familyProfile, samplePlan, keys);
    expect(result).not.toBeNull();
    expect(result?.provider).toBe("gemini");
    expect(result?.narrative).toEqual(sampleNarrative);
  });

  it.each([
    {
      name: "Gemini schema failure and NVIDIA choices empty",
      gemini: () => makeJsonResponse({ notCandidates: true }),
      nvidia: () => makeJsonResponse({ choices: [] }),
    },
    {
      name: "Gemini missing text and NVIDIA schema failure",
      gemini: () => makeJsonResponse({ candidates: [{ content: { parts: [] } }] }),
      nvidia: () => makeJsonResponse({ invalidChoices: 123 }),
    },
  ])("handles unexpected response shapes safely: $name", async ({ gemini, nvidia }) => {
    stubProviders({ gemini, nvidia });
    const result = await generateNarrative(familyProfile, samplePlan, keys);
    expect(result).toBeNull();
  });

  it("handles non-Error thrown rejections in providers chain", async () => {
    stubProviders({
      gemini: () => Promise.reject("string rejection"),
      nvidia: () => Promise.reject("string rejection"),
    });

    const result = await generateNarrative(familyProfile, samplePlan, keys);
    expect(result).toBeNull();
  });
});
