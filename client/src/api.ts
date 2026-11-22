/// <reference types="vite/client" />
import { z } from "zod";
import type { Profile } from "./profile";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

const healthResponseSchema = z.object({
  status: z.string(),
  uptimeSeconds: z.number(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

const geocodePlaceSchema = z.object({
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  region: z.string().optional(),
  country: z.string().optional(),
});
export type GeocodePlace = z.infer<typeof geocodePlaceSchema>;

const geocodeResultsSchema = z.object({
  results: z.array(geocodePlaceSchema),
});
export type GeocodeResults = z.infer<typeof geocodeResultsSchema>;

const routinePeriodSchema = z.enum(["morning", "afternoon", "evening"]);

const routineItemSchema = z.object({
  period: routinePeriodSchema,
  advice: z.string(),
});

const tipItemSchema = z.object({
  title: z.string(),
  detail: z.string(),
});

const narrativeSchema = z.object({
  summary: z.string(),
  routine: z.array(routineItemSchema),
  tips: z.array(tipItemSchema),
});
export type Narrative = z.infer<typeof narrativeSchema>;

const aqiBandSchema = z.object({
  label: z.string(),
  level: z.number(),
});

const planAirSchema = z.object({
  time: z.string(),
  usAqi: z.number().nullable(),
  pm25: z.number().nullable(),
  band: aqiBandSchema.nullable(),
  whoRatio: z.number().nullable(),
});

const verdictLevelSchema = z.enum(["go", "caution", "limit-outdoors", "unknown"]);

const verdictSchema = z.object({
  level: verdictLevelSchema,
  headline: z.string(),
  note: z.string().nullable(),
});

const hourReadingSchema = z.object({
  time: z.string(),
  pm25: z.number(),
});

const planHoursSchema = z
  .object({
    best: hourReadingSchema,
    worst: hourReadingSchema,
  })
  .nullable();

const leverSchema = z.enum([
  "n95-outdoors",
  "shift-outdoor-activity",
  "ventilate-at-low-hour",
  "air-purifier",
  "avoid-car-trips",
]);

const actionIdSchema = z.enum([
  ...leverSchema.options,
  "cleaner-heating",
  "cleaner-cooking",
]);

const basisSchema = z.enum(["standard", "forecast", "arithmetic", "rough estimate"]);

const impactSchema = z.object({
  lever: leverSchema,
  value: z.number(),
  unit: z.string(),
  basis: basisSchema,
  source: z.string().optional(),
  assumptions: z.array(z.string()),
});

const actionSchema = z.object({
  id: actionIdSchema,
  title: z.string(),
  detail: z.string(),
  because: z.string(),
  impact: impactSchema.nullable(),
});

export const planSchema = z.object({
  generatedBy: z.enum(["static", "gemini", "nvidia"]),
  narrative: narrativeSchema.nullable(),
  air: planAirSchema,
  verdict: verdictSchema,
  hours: planHoursSchema,
  actions: z.array(actionSchema),
  disclaimer: z.string(),
});
export type Plan = z.infer<typeof planSchema>;

const serverErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch (err) {
    if (typeof err === "object" && err !== null && "name" in err && err.name === "AbortError") {
      throw err;
    }
    const message = err instanceof Error ? err.message : "Network failure";
    throw new ApiError("NETWORK", message);
  }

  if (!response.ok) {
    let errorJson: unknown = null;
    try {
      errorJson = await response.json();
    } catch {
      // WHY: A proxy or crashed server may return HTML, and the code falls back to UPSTREAM.
    }
    const parsedEnvelope = serverErrorSchema.safeParse(errorJson);
    if (parsedEnvelope.success) {
      throw new ApiError(
        parsedEnvelope.data.error.code,
        parsedEnvelope.data.error.message
      );
    }
    throw new ApiError("UPSTREAM", `HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("BAD_RESPONSE", "Invalid JSON response");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError("BAD_RESPONSE", "Response failed schema validation");
  }

  return result.data;
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request("/api/health", healthResponseSchema, { signal });
}

export function searchLocations(query: string, signal?: AbortSignal): Promise<GeocodeResults> {
  return request(`/api/geocode?q=${encodeURIComponent(query)}`, geocodeResultsSchema, { signal });
}

export function createPlan(profile: Profile, signal?: AbortSignal): Promise<Plan> {
  return request("/api/plan", planSchema, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profile),
    signal,
  });
}
