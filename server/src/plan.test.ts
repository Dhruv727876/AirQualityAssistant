import { describe, it, expect } from "vitest";
import { buildPlan, type PlanAir } from "./plan.js";
import type { Profile } from "./profile.js";
import type { HourlyAir } from "./openMeteo.js";

type FamilyProfile = Extract<Profile, { mode: "family" }>;

function make24HourAir(hoursWithPm25?: { hour: number; pm25: number | null }[]): HourlyAir[] {
  const overrides = new Map(hoursWithPm25?.map((h) => [h.hour, h.pm25]));
  const result: HourlyAir[] = [];
  for (let h = 0; h < 24; h++) {
    const pad = String(h).padStart(2, "0");
    const pm25 = overrides.has(h) ? (overrides.get(h) ?? null) : 20 + h;
    result.push({
      time: `2026-01-01T${pad}:00`,
      usAqi: 50 + h,
      pm25,
    });
  }
  return result;
}

const baseFamilyProfile: FamilyProfile = {
  mode: "family",
  location: { name: "Downtown", latitude: 28.61, longitude: 77.2 },
  members: { adults: 2, children: 0, elderly: 0 },
  hasSensitiveMember: false,
  commute: { mode: "remote", oneWayKm: 0, daysPerWeek: 0 },
  roomAreaM2: 20,
  heating: "electric",
  cooking: "electric",
};

describe("plan builder", () => {
  describe("verdict boundaries", () => {
    it.each([
      // Non-sensitive: <= 100 go, 101-150 caution, > 150 limit-outdoors
      { sensitive: false, aqi: 50, expected: "go" },
      { sensitive: false, aqi: 51, expected: "go" },
      { sensitive: false, aqi: 100, expected: "go" },
      { sensitive: false, aqi: 101, expected: "caution" },
      { sensitive: false, aqi: 150, expected: "caution" },
      { sensitive: false, aqi: 151, expected: "limit-outdoors" },
      // Sensitive: <= 50 go, 51-100 caution, > 100 limit-outdoors
      { sensitive: true, aqi: 50, expected: "go" },
      { sensitive: true, aqi: 51, expected: "caution" },
      { sensitive: true, aqi: 100, expected: "caution" },
      { sensitive: true, aqi: 101, expected: "limit-outdoors" },
      // Null AQI -> unknown
      { sensitive: false, aqi: null, expected: "unknown" },
      { sensitive: true, aqi: null, expected: "unknown" },
    ])(
      "evaluates AQI $aqi (sensitive: $sensitive) to $expected",
      ({ sensitive, aqi, expected }) => {
        const profile: FamilyProfile = {
          ...baseFamilyProfile,
          hasSensitiveMember: sensitive,
        };
        const air: PlanAir = {
          current: {
            time: "2026-01-01T10:00",
            usAqi: aqi,
            pm25: aqi !== null ? 25 : null,
            band: null,
          },
          hourly: make24HourAir(),
        };

        const plan = buildPlan(profile, air);
        expect(plan.verdict.level).toBe(expected);
        if (sensitive) {
          expect(plan.verdict.note).toContain("Your household includes");
        } else {
          expect(plan.verdict.note).toBeNull();
        }
      }
    );

    it("evaluates community mode as sensitive with community note", () => {
      const profile: Profile = {
        mode: "community",
        households: 20,
        hasSensitiveMember: false,
        location: { name: "Eco Block", latitude: 28.61, longitude: 77.2 },
        commute: { mode: "car", oneWayKm: 10, daysPerWeek: 5 },
        roomAreaM2: 25,
        heating: "electric",
        cooking: "electric",
      };
      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: 75, // > 50 so caution under sensitive
          pm25: 25,
          band: { label: "Moderate", level: 1 },
        },
        hourly: make24HourAir(),
      };

      const plan = buildPlan(profile, air);
      expect(plan.verdict.level).toBe("caution");
      expect(plan.verdict.note).toBe(
        "This plan treats the community as including sensitive groups, so the thresholds are stricter."
      );
    });

    it("evaluates family sensitivity when children > 0 or elderly > 0", () => {
      const profileChild: FamilyProfile = {
        ...baseFamilyProfile,
        members: { adults: 2, children: 1, elderly: 0 },
      };
      const profileElderly: FamilyProfile = {
        ...baseFamilyProfile,
        members: { adults: 2, children: 0, elderly: 1 },
      };
      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: 75,
          pm25: 25,
          band: null,
        },
        hourly: make24HourAir(),
      };

      expect(buildPlan(profileChild, air).verdict.level).toBe("caution");
      expect(buildPlan(profileElderly, air).verdict.level).toBe("caution");
    });
  });

  describe("scenario tests", () => {
    it("full unhealthy scenario returns all 7 actions in order with calculated impacts", () => {
      const profile: FamilyProfile = {
        mode: "family",
        location: { name: "North City", latitude: 28.61, longitude: 77.2 },
        members: { adults: 2, children: 1, elderly: 0 },
        hasSensitiveMember: false,
        commute: { mode: "car", oneWayKm: 10, daysPerWeek: 5 },
        roomAreaM2: 12,
        purifierCadrM3PerHour: 200,
        heating: "wood-or-coal",
        cooking: "wood-or-coal",
      };

      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: 180,
          pm25: 110,
          band: { label: "Unhealthy", level: 3 },
        },
        hourly: make24HourAir([
          { hour: 8, pm25: 20 },
          { hour: 18, pm25: 150 },
        ]),
      };

      const plan = buildPlan(profile, air);

      expect(plan.verdict.level).toBe("limit-outdoors");
      expect(plan.actions.map((a) => a.id)).toEqual([
        "n95-outdoors",
        "shift-outdoor-activity",
        "ventilate-at-low-hour",
        "air-purifier",
        "avoid-car-trips",
        "cleaner-heating",
        "cleaner-cooking",
      ]);

      for (const action of plan.actions) {
        expect(action.detail).not.toContain("...");
        expect(action.detail).not.toContain("undefined");
        expect(action.detail).not.toContain("NaN");
        expect(action.because).not.toContain("...");
        expect(action.because).not.toContain("undefined");
        expect(action.because).not.toContain("NaN");
      }

      const purifierAction = plan.actions.find((a) => a.id === "air-purifier");
      expect(purifierAction?.impact?.value).toBe(90);

      const ventilateAction = plan.actions.find((a) => a.id === "ventilate-at-low-hour");
      expect(ventilateAction?.detail).toContain("keep windows closed");

      const avoidCarAction = plan.actions.find((a) => a.id === "avoid-car-trips");
      expect(avoidCarAction?.impact?.value).toBe(100);

      const heatingAction = plan.actions.find((a) => a.id === "cleaner-heating");
      expect(heatingAction?.impact).toBeNull();

      const cookingAction = plan.actions.find((a) => a.id === "cleaner-cooking");
      expect(cookingAction?.impact).toBeNull();

      expect(plan.hours).not.toBeNull();
      expect(plan.hours?.best.pm25).toBe(20);
      expect(plan.air.whoRatio).toBe(7.3);
      expect(plan.disclaimer).toContain("General information, not medical advice");
    });

    it("two-wheeler commute generates avoid-car-trips action with vehicle text", () => {
      const profile: FamilyProfile = {
        ...baseFamilyProfile,
        commute: { mode: "two-wheeler", oneWayKm: 5, daysPerWeek: 4 },
      };
      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: 120,
          pm25: 45,
          band: null,
        },
        hourly: make24HourAir(),
      };

      const plan = buildPlan(profile, air);
      const avoidCarAction = plan.actions.find((a) => a.id === "avoid-car-trips");
      expect(avoidCarAction).toBeDefined();
      expect(avoidCarAction?.impact?.value).toBe(40);
      expect(avoidCarAction?.because).toContain("You commute by two-wheeler (5 km one-way, 4 days/week)");
    });

    it("go day with clean lifestyle returns zero actions", () => {
      const profile: FamilyProfile = {
        ...baseFamilyProfile,
        commute: { mode: "remote", oneWayKm: 0, daysPerWeek: 0 },
        heating: "electric",
        cooking: "electric",
      };
      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: 30,
          pm25: 7,
          band: { label: "Good", level: 0 },
        },
        hourly: make24HourAir(),
      };

      const plan = buildPlan(profile, air);
      expect(plan.verdict.level).toBe("go");
      expect(plan.actions).toHaveLength(0);
    });

    it("community mode scales avoid-car-trips impact by number of households", () => {
      const profile: Profile = {
        mode: "community",
        households: 50,
        hasSensitiveMember: false,
        location: { name: "Green Valley", latitude: 28.61, longitude: 77.2 },
        commute: { mode: "car", oneWayKm: 10, daysPerWeek: 5 },
        roomAreaM2: 30,
        heating: "electric",
        cooking: "gas",
      };
      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: 120,
          pm25: 45,
          band: { label: "Unhealthy for Sensitive Groups", level: 2 },
        },
        hourly: make24HourAir(),
      };

      const plan = buildPlan(profile, air);
      const action = plan.actions.find((a) => a.id === "avoid-car-trips");
      expect(action?.impact?.value).toBe(5000);
      expect(action?.because).toContain("across 50 households");
    });

    it("omits shift/ventilate actions and sets hours to null when waking entries < 2", () => {
      const hourlyWithOneWakingEntry: HourlyAir[] = [
        { time: "2026-01-01T04:00", usAqi: 160, pm25: 80 },
        { time: "2026-01-01T10:00", usAqi: 160, pm25: 80 },
        { time: "2026-01-01T23:00", usAqi: 160, pm25: 80 },
      ];
      const profile: FamilyProfile = {
        ...baseFamilyProfile,
        heating: "wood-or-coal",
      };
      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: 160,
          pm25: 80,
          band: null,
        },
        hourly: hourlyWithOneWakingEntry,
      };

      const plan = buildPlan(profile, air);
      expect(plan.hours).toBeNull();
      const actionIds = plan.actions.map((a) => a.id);
      expect(actionIds).not.toContain("shift-outdoor-activity");
      expect(actionIds).not.toContain("ventilate-at-low-hour");
      expect(actionIds).toContain("n95-outdoors");
      expect(actionIds).toContain("cleaner-heating");
    });

    it("omits timing actions when timingImpact returns null (worst waking PM2.5 is 0)", () => {
      const hourlyWithZeroWakingPm25: HourlyAir[] = [
        { time: "2026-01-01T08:00", usAqi: 160, pm25: 0 },
        { time: "2026-01-01T10:00", usAqi: 160, pm25: 0 },
      ];
      const profile: FamilyProfile = {
        ...baseFamilyProfile,
      };
      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: 160,
          pm25: 80,
          band: null,
        },
        hourly: hourlyWithZeroWakingPm25,
      };

      const plan = buildPlan(profile, air);
      expect(plan.hours).not.toBeNull();
      const actionIds = plan.actions.map((a) => a.id);
      expect(actionIds).not.toContain("shift-outdoor-activity");
      expect(actionIds).not.toContain("ventilate-at-low-hour");
      expect(actionIds).toContain("n95-outdoors");
    });

    it("handles null usAqi with unknown verdict and 0 airDriven actions", () => {
      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: null,
          pm25: null,
          band: null,
        },
        hourly: make24HourAir(),
      };

      const plan = buildPlan(baseFamilyProfile, air);
      expect(plan.verdict.level).toBe("unknown");
      expect(plan.verdict.headline).toBe("Live air data is incomplete for this hour; plan cautiously.");
      expect(plan.air.whoRatio).toBeNull();
      expect(plan.actions).toHaveLength(0);
    });

    it("ignores vehicle commute if oneWayKm or daysPerWeek is 0", () => {
      const profileZeroKm: FamilyProfile = {
        ...baseFamilyProfile,
        commute: { mode: "car", oneWayKm: 0, daysPerWeek: 5 },
      };
      const profileZeroDays: FamilyProfile = {
        ...baseFamilyProfile,
        commute: { mode: "car", oneWayKm: 10, daysPerWeek: 0 },
      };
      const air: PlanAir = {
        current: {
          time: "2026-01-01T10:00",
          usAqi: 50,
          pm25: 10,
          band: null,
        },
        hourly: make24HourAir(),
      };

      expect(buildPlan(profileZeroKm, air).actions).toHaveLength(0);
      expect(buildPlan(profileZeroDays, air).actions).toHaveLength(0);
    });
  });
});
