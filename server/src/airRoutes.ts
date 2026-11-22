import { Router } from "express";
import { z } from "zod";
import { validateInput } from "./errors.js";
import { searchPlaces } from "./openMeteo.js";
import { loadAir } from "./airData.js";

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

export const airRouter = Router();

airRouter.get("/geocode", async (req, res) => {
  const { q } = validateInput(geocodeQuerySchema, req.query);
  const data = await searchPlaces(q);
  res.status(200).json(data);
});

airRouter.get("/air", async (req, res) => {
  const { lat, lon } = validateInput(airQuerySchema, req.query);
  const data = await loadAir(lat, lon);
  res.status(200).json(data);
});
