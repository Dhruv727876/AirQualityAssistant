import { z } from "zod";
import { AppError } from "./errors.js";
import { aqiBand, type AqiBand } from "./aqiBand.js";

const geocodingResultSchema = z.object({
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  admin1: z.string().optional(),
});

const geocodingResponseSchema = z.object({
  results: z.array(geocodingResultSchema).optional(),
});

const airQualityResponseSchema = z.object({
  current: z.object({
    time: z.string(),
    us_aqi: z.number().nullable().optional(),
    pm2_5: z.number().nullable().optional(),
    pm10: z.number().nullable().optional(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    us_aqi: z.array(z.number().nullable().optional()),
    pm2_5: z.array(z.number().nullable().optional()),
  }),
});

interface GeocodePlace {
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

interface CurrentAir {
  time: string;
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  band: AqiBand | null;
}

export interface HourlyAir {
  time: string;
  usAqi: number | null;
  pm25: number | null;
}

interface AirQualityData {
  current: CurrentAir;
  hourly: HourlyAir[];
}

async function fetchJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  try {
    // 5-second timeout ensures slow upstream calls do not exhaust server connection capacity
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error(`Upstream returned HTTP ${response.status}`);
    }
    const json: unknown = await response.json();
    const result = schema.safeParse(json);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  } catch (error) {
    console.error("Open-Meteo upstream error:", error);
    throw new AppError(502, "UPSTREAM_ERROR", "Location and air quality data are temporarily unavailable");
  }
}

export async function searchPlaces(query: string): Promise<{ results: GeocodePlace[] }> {
  const params = new URLSearchParams({
    name: query,
    count: "5",
    language: "en",
    format: "json",
  });
  const url = `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`;
  const data = await fetchJson(url, geocodingResponseSchema);
  const places = data.results ?? [];

  return {
    results: places.map((place) => ({
      name: place.name,
      region: place.admin1,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
    })),
  };
}

export async function getAirQuality(lat: number, lon: number): Promise<AirQualityData> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    current: "us_aqi,pm2_5,pm10",
    hourly: "us_aqi,pm2_5",
    forecast_days: "2",
    timezone: "auto",
  });
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`;
  const data = await fetchJson(url, airQualityResponseSchema);

  // Preserve null because upstream model coverage or sensor gaps leave specific pollutants unmeasured
  const usAqi = data.current.us_aqi ?? null;
  const pm25 = data.current.pm2_5 ?? null;
  const pm10 = data.current.pm10 ?? null;
  const band = aqiBand(usAqi);

  const hourlyList: HourlyAir[] = [];
  for (let i = 0; i < data.hourly.time.length; i++) {
    const time = data.hourly.time[i];
    if (time !== undefined && time >= data.current.time) {
      hourlyList.push({
        time,
        usAqi: data.hourly.us_aqi[i] ?? null,
        pm25: data.hourly.pm2_5[i] ?? null,
      });
      if (hourlyList.length === 24) {
        break;
      }
    }
  }

  return {
    current: {
      time: data.current.time,
      usAqi,
      pm25,
      pm10,
      band,
    },
    hourly: hourlyList,
  };
}
