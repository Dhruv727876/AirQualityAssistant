import { describe, it, expect } from "vitest";
import { containsNumber, parseNarrative, type Narrative } from "./narrative.js";

const sampleValidNarrative: Narrative = {
  summary:
    "Air quality requires attention today. Reducing exposure during peak hours helps protect your household from fine particles.",
  routine: [
    {
      period: "morning",
      advice: "Keep windows closed during early hours when fine particles accumulate.",
    },
    {
      period: "afternoon",
      advice: "Ventilate briefly in the afternoon if local outdoor air improves.",
    },
  ],
  tips: [
    {
      title: "Indoor filtration",
      detail: "Run an air purifier in common rooms to reduce indoor exposure.",
    },
  ],
};

describe("containsNumber", () => {
  it("returns false when no digits exist", () => {
    expect(containsNumber("Clean air and fresh breeze")).toBe(false);
  });

  it("returns false for allowed acronyms PM2.5, PM10, and N95", () => {
    expect(containsNumber("Wear an N95 mask against PM2.5 and PM10")).toBe(false);
  });

  it("returns true when any remaining digit exists", () => {
    expect(containsNumber("PM2.5 concentration was 25 today")).toBe(true);
    expect(containsNumber("Open windows at 14:00")).toBe(true);
  });
});

describe("parseNarrative", () => {
  it("parses a valid narrative JSON object", () => {
    const raw = JSON.stringify(sampleValidNarrative);
    const parsed = parseNarrative(raw);
    expect(parsed).toEqual(sampleValidNarrative);
  });

  it("parses JSON wrapped in a markdown fenced block with surrounding chatter", () => {
    const raw = `Here is your requested plan:\n\`\`\`json\n${JSON.stringify(
      sampleValidNarrative
    )}\n\`\`\`\nLet me know if you need any adjustments.`;
    const parsed = parseNarrative(raw);
    expect(parsed).toEqual(sampleValidNarrative);
  });

  it("returns null on malformed or invalid JSON", () => {
    expect(parseNarrative("not a json string")).toBeNull();
    expect(parseNarrative("{ unclosed json: true ")).toBeNull();
    expect(parseNarrative("{ invalid: json }")).toBeNull();
    expect(parseNarrative("")).toBeNull();
    expect(parseNarrative("}{")).toBeNull();
  });

  it.each([
    {
      field: "summary",
      modify: (n: Narrative) => ({ ...n, summary: "Air quality index is 150 today." }),
    },
    {
      field: "routine advice",
      modify: (n: Narrative) => {
        const period: "morning" | "afternoon" | "evening" = "morning";
        return {
          ...n,
          routine: [{ period, advice: "Ventilate at 10:00." }],
        };
      },
    },
    {
      field: "tip detail",
      modify: (n: Narrative) => ({
        ...n,
        tips: [{ title: "Purifier", detail: "Reduces dust by 50 percent." }],
      }),
    },
  ])("returns null when digits appear in $field", ({ modify }) => {
    const invalidObj = modify(sampleValidNarrative);
    expect(parseNarrative(JSON.stringify(invalidObj))).toBeNull();
  });

  it("allows PM2.5, PM10, and N95 tokens in string fields", () => {
    const narrativeWithTokens: Narrative = {
      summary: "High levels of PM2.5 and PM10 require protective habits today.",
      routine: [
        {
          period: "morning",
          advice: "Wear an N95 mask outdoors to protect against PM2.5.",
        },
      ],
      tips: [
        {
          title: "N95 filtration",
          detail: "A fitted N95 respirator reduces fine particles effectively.",
        },
      ],
    };
    const parsed = parseNarrative(JSON.stringify(narrativeWithTokens));
    expect(parsed).toEqual(narrativeWithTokens);
  });

  it("returns null when unknown extra keys are present in top-level or child objects", () => {
    const withExtraTopKey = { ...sampleValidNarrative, extraField: "disallowed" };
    expect(parseNarrative(JSON.stringify(withExtraTopKey))).toBeNull();

    const withExtraRoutineKey = {
      ...sampleValidNarrative,
      routine: [
        {
          period: "morning",
          advice: "Keep windows closed.",
          unexpected: true,
        },
      ],
    };
    expect(parseNarrative(JSON.stringify(withExtraRoutineKey))).toBeNull();

    const withExtraTipKey = {
      ...sampleValidNarrative,
      tips: [
        {
          title: "Clean air",
          detail: "Use filters.",
          extraKey: 123,
        },
      ],
    };
    expect(parseNarrative(JSON.stringify(withExtraTipKey))).toBeNull();
  });

  it("returns null when routine entries exceed max limit of 3 or is empty", () => {
    const tooManyRoutines = {
      ...sampleValidNarrative,
      routine: [
        { period: "morning", advice: "One" },
        { period: "afternoon", advice: "Two" },
        { period: "evening", advice: "Three" },
        { period: "morning", advice: "Four" },
      ],
    };
    expect(parseNarrative(JSON.stringify(tooManyRoutines))).toBeNull();

    const emptyRoutine = { ...sampleValidNarrative, routine: [] };
    expect(parseNarrative(JSON.stringify(emptyRoutine))).toBeNull();
  });

  it("returns null when tips entries exceed max limit of 3", () => {
    const tooManyTips = {
      ...sampleValidNarrative,
      tips: [
        { title: "One", detail: "Detail one" },
        { title: "Two", detail: "Detail two" },
        { title: "Three", detail: "Detail three" },
        { title: "Four", detail: "Detail four" },
      ],
    };
    expect(parseNarrative(JSON.stringify(tooManyTips))).toBeNull();
  });

  it.each([
    {
      target: "summary",
      modify: (n: Narrative) => ({ ...n, summary: "a".repeat(401) }),
    },
    {
      target: "routine advice",
      modify: (n: Narrative) => {
        const period: "morning" | "afternoon" | "evening" = "morning";
        return {
          ...n,
          routine: [{ period, advice: "a".repeat(221) }],
        };
      },
    },
    {
      target: "tip title",
      modify: (n: Narrative) => ({
        ...n,
        tips: [{ title: "a".repeat(61), detail: "Valid detail" }],
      }),
    },
    {
      target: "tip detail",
      modify: (n: Narrative) => ({
        ...n,
        tips: [{ title: "Valid title", detail: "a".repeat(221) }],
      }),
    },
  ])("returns null when $target exceeds character length limit", ({ modify }) => {
    const overLengthObj = modify(sampleValidNarrative);
    expect(parseNarrative(JSON.stringify(overLengthObj))).toBeNull();
  });
});
