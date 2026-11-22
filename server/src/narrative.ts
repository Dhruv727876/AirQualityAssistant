import { z } from "zod";

export function containsNumber(text: string): boolean {
  const stripped = text.replace(/PM2\.5|PM10|N95/g, "");
  return /\d/.test(stripped);
}

function plainText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((val) => !containsNumber(val), {
      message: "Must not contain numbers",
    });
}

const routinePeriodSchema = z.enum(["morning", "afternoon", "evening"]);

const routineItemSchema = z.strictObject({
  period: routinePeriodSchema,
  advice: plainText(220),
});

const tipItemSchema = z.strictObject({
  title: plainText(60),
  detail: plainText(220),
});

const narrativeSchema = z.strictObject({
  summary: plainText(400),
  routine: z.array(routineItemSchema).min(1).max(3),
  tips: z.array(tipItemSchema).max(3),
});

export type Narrative = z.infer<typeof narrativeSchema>;

export function parseNarrative(raw: string): Narrative | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      return null;
    }
    const jsonStr = raw.slice(start, end + 1);
    const parsed: unknown = JSON.parse(jsonStr);
    const result = narrativeSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}
