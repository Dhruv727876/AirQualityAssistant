import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanView } from "./PlanView";
import { samplePlan } from "./testData";
import type { Plan } from "./api";

describe("PlanView", () => {
  it('impact null shows "Not quantified."', () => {
    render(<PlanView plan={samplePlan} />);
    expect(screen.getByText("Impact: Not quantified.")).toBeDefined();
  });

  it("a narrative containing <b>x</b> appears literally, with no <b> element", () => {
    const boldPlan: Plan = {
      ...samplePlan,
      generatedBy: "gemini",
      narrative: {
        summary: "Special advice: <b>x</b> keeps you safe.",
        routine: [
          { period: "morning", advice: "Morning <b>x</b> routine" },
        ],
        tips: [
          { title: "Tip <b>x</b>", detail: "Detail <b>x</b>" },
        ],
      },
    };

    const { container } = render(<PlanView plan={boldPlan} />);

    expect(screen.getByText("Special advice: <b>x</b> keeps you safe.")).toBeDefined();
    expect(screen.getByText("Wording by Gemini")).toBeDefined();
    expect(container.querySelector("b")).toBeNull();
  });

  it("best and worst hours get today/tomorrow labels", () => {
    const hoursPlan: Plan = {
      ...samplePlan,
      air: {
        ...samplePlan.air,
        time: "2026-01-10T10:00",
      },
      hours: {
        best: { time: "2026-01-10T14:00", pm25: 35 },
        worst: { time: "2026-01-11T08:00", pm25: 180 },
      },
    };

    render(<PlanView plan={hoursPlan} />);

    expect(screen.getByText("Best hour: today at 14:00, PM2.5 35 µg/m³")).toBeDefined();
    expect(screen.getByText("Worst hour: tomorrow at 08:00, PM2.5 180 µg/m³")).toBeDefined();
  });

  it('null air values show "Not available"', () => {
    const nullAirPlan: Plan = {
      ...samplePlan,
      air: {
        time: "2026-01-10T10:00",
        usAqi: null,
        pm25: null,
        band: null,
        whoRatio: null,
      },
    };

    render(<PlanView plan={nullAirPlan} />);

    expect(screen.getByText("Air quality: AQI Not available, PM2.5 Not available")).toBeDefined();
  });

  it("renders verdict note, NVIDIA attribution, and impact source when present", () => {
    const customPlan: Plan = {
      ...samplePlan,
      generatedBy: "nvidia",
      verdict: {
        level: "caution",
        headline: "Air warning headline",
        note: "Sensitive groups should wear masks.",
      },
      actions: [
        {
          id: "air-purifier",
          title: "Run Purifier",
          detail: "Run on high",
          because: "High PM2.5",
          impact: {
            lever: "air-purifier",
            value: 50,
            unit: "%",
            basis: "standard",
            source: "EPA Indoor Air Study",
            assumptions: ["Room is sealed"],
          },
        },
      ],
    };

    render(<PlanView plan={customPlan} />);

    expect(screen.getByText("Sensitive groups should wear masks.")).toBeDefined();
    expect(screen.getByText("Wording by NVIDIA")).toBeDefined();
    expect(screen.getByText(/— EPA Indoor Air Study/)).toBeDefined();
  });
});
