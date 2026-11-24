import { Router } from "express";
import { profileSchema } from "./profile.js";
import { validateInput } from "./errors.js";
import { getAirQuality } from "./openMeteo.js";
import { buildPlan } from "./plan.js";
import { generateNarrative, type LlmKeys } from "./llm.js";

export function createPlanRouter(keys: LlmKeys): Router {
  const router = Router();

  // The household profile is personal data: it is validated strictly, never logged, and never echoed in error messages.
  router.post("/plan", async (req, res) => {
    const profile = validateInput(profileSchema, req.body);
    const air = await getAirQuality(profile.location.latitude, profile.location.longitude);
    const plan = buildPlan(profile, air);
    const result = await generateNarrative(profile, plan, keys);
    res.setHeader("Cache-Control", "no-store");
    if (result !== null) {
      res.json({
        ...plan,
        generatedBy: result.provider,
        narrative: result.narrative,
      });
      return;
    }
    res.json(plan);
  });

  return router;
}
