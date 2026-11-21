import { Router } from "express";
import { z } from "zod";
import { AppError } from "./errors.js";
import { searchPlaces, getAirQuality } from "./openMeteo.js";

const geocodeQuerySchema = z.object({
  q: z
    .string()
    .transform((val) => val.trim())
    .pipe(z.string().min(2).max(100)),
});

const coordinate = (limit: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform(Number)
    .pipe(z.number().min(-limit).max(limit));

const airQuerySchema = z.object({
  lat: coordinate(90),
  lon: coordinate(180),
});

function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new AppError(400, "INVALID_INPUT", `Invalid query parameter: ${fields}`);
  }
  return result.data;
}

export const airRouter = Router();

airRouter.get("/geocode", async (req, res) => {
  const { q } = parseQuery(geocodeQuerySchema, req.query);
  const data = await searchPlaces(q);
  res.status(200).json(data);
});

airRouter.get("/air", async (req, res) => {
  const { lat, lon } = parseQuery(airQuerySchema, req.query);
  const data = await getAirQuality(lat, lon);
  res.status(200).json(data);
});
