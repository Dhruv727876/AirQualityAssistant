import { Router } from "express";
import { profileSchema } from "./profile.js";
import { validateInput } from "./errors.js";
import { getAirQuality } from "./openMeteo.js";
import { buildPlan } from "./plan.js";

export const planRouter = Router();

// The household profile is personal data: it is validated strictly, never logged, and never echoed in error messages.
planRouter.post("/plan", async (req, res) => {
  const profile = validateInput(profileSchema, req.body);
  const air = await getAirQuality(profile.location.latitude, profile.location.longitude);
  res.json(buildPlan(profile, air));
});
