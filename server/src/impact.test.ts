import { describe, it, expect } from "vitest";
import {
  whoRatio,
  maskImpact,
  wakingExtremes,
  timingImpact,
  purifierImpact,
  avoidCarTripsImpact,
  formatWhen,
} from "./impact.js";
import type { HourlyAir } from "./openMeteo.js";

describe("wakingExtremes", () => {
  it.each([
    {
      name: "identifies lowest and highest waking hours including time strings",
      hourly: [
        { time: "2026-01-01T04:00", usAqi: 20, pm25: 5 },
        { time: "2026-01-01T08:00", usAqi: 60, pm25: 25 },
        { time: "2026-01-01T12:00", usAqi: 150, pm25: 60 },
        { time: "2026-01-01T15:00", usAqi: 40, pm25: 15 },
        { time: "2026-01-01T22:00", usAqi: 10, pm25: 2 },
      ],
      expectedBestTime: "2026-01-01T15:00",
      expectedBestPm25: 15,
      expectedWorstTime: "2026-01-01T12:00",
      expectedWorstPm25: 60,
    },
    {
      name: "keeps first entry on ties",
      hourly: [
        { time: "2026-01-01T08:00", usAqi: 50, pm25: 20 },
        { time: "2026-01-01T10:00", usAqi: 50, pm25: 20 },
        { time: "2026-01-01T14:00", usAqi: 100, pm25: 50 },
        { time: "2026-01-01T16:00", usAqi: 100, pm25: 50 },
      ],
      expectedBestTime: "2026-01-01T08:00",
      expectedBestPm25: 20,
      expectedWorstTime: "2026-01-01T14:00",
      expectedWorstPm25: 50,
    },
  ])(
    "$name",
    ({ hourly, expectedBestTime, expectedBestPm25, expectedWorstTime, expectedWorstPm25 }) => {
      const result = wakingExtremes(hourly);
      expect(result).not.toBeNull();
      expect(result?.best.time).toBe(expectedBestTime);
      expect(result?.best.pm25).toBe(expectedBestPm25);
      expect(result?.worst.time).toBe(expectedWorstTime);
      expect(result?.worst.pm25).toBe(expectedWorstPm25);
    }
  );

  it.each([
    { name: "empty list", hourly: [] },
    { name: "only one waking entry", hourly: [{ time: "2026-01-01T10:00", usAqi: 50, pm25: 20 }] },
    {
      name: "only entries outside waking window",
      hourly: [
        { time: "2026-01-01T02:00", usAqi: 50, pm25: 20 },
        { time: "2026-01-01T23:00", usAqi: 60, pm25: 25 },
      ],
    },
    {
      name: "entries with null pm25",
      hourly: [
        { time: "2026-01-01T10:00", usAqi: null, pm25: null },
        { time: "2026-01-01T12:00", usAqi: 50, pm25: 20 },
      ],
    },
  ])("returns null when fewer than 2 qualify: $name", ({ hourly }) => {
    expect(wakingExtremes(hourly)).toBeNull();
  });
});

describe("formatWhen", () => {
  it.each([
    {
      reading: { time: "2026-01-01T14:00", hour: 14, pm25: 20 },
      current: "2026-01-01T10:00",
      expected: "today at 14:00",
    },
    {
      reading: { time: "2026-01-02T08:00", hour: 8, pm25: 50 },
      current: "2026-01-01T10:00",
      expected: "tomorrow at 08:00",
    },
  ])(
    "formats reading $reading.time with current $current -> $expected",
    ({ reading, current, expected }) => {
      expect(formatWhen(reading, current)).toBe(expected);
    }
  );
});

describe("whoRatio", () => {
  it.each([
    [30, 2],
    [7.5, 0.5],
    [null, null],
  ])("computes ratio for pm25=%s -> %s", (input, expected) => {
    expect(whoRatio(input)).toBe(expected);
  });
});

describe("maskImpact", () => {
  it("returns standard 95% filtration with seal caveat", () => {
    const impact = maskImpact();
    expect(impact.value).toBe(95);
    expect(impact.basis).toBe("standard");
    expect(impact.unit).toBe("% of fine particles filtered (up to)");
    expect(impact.assumptions.some((a) => a.includes("seal"))).toBe(true);
  });
});

describe("timingImpact", () => {
  it("picks lowest and highest PM2.5 among waking hours and ignores 03:00 value", () => {
    const hourly: HourlyAir[] = [
      { time: "2026-01-01T03:00", usAqi: 20, pm25: 5 }, // lower but outside waking hours (ignored)
      { time: "2026-01-01T08:00", usAqi: 80, pm25: 30 },
      { time: "2026-01-01T14:00", usAqi: 50, pm25: 20 }, // best waking hour
      { time: "2026-01-01T18:00", usAqi: 150, pm25: 50 }, // worst waking hour
      { time: "2026-01-01T23:00", usAqi: 40, pm25: 15 }, // outside waking hours (ignored)
    ];

    const impact = timingImpact("shift-outdoor-activity", hourly, "2026-01-01T10:00");
    expect(impact).not.toBeNull();
    // (1 - 20 / 50) * 100 = 60%
    expect(impact?.value).toBe(60);
    expect(impact?.basis).toBe("forecast");
    expect(impact?.assumptions[0]).toContain("14:00");
    expect(impact?.assumptions[0]).toContain("18:00");
    expect(impact?.assumptions[0]).toContain("today at 14:00");
  });

  it("ignores entries with null pm25", () => {
    const hourly: HourlyAir[] = [
      { time: "2026-01-01T08:00", usAqi: null, pm25: null },
      { time: "2026-01-01T10:00", usAqi: 100, pm25: 40 },
      { time: "2026-01-01T12:00", usAqi: 50, pm25: 20 },
    ];

    const impact = timingImpact("ventilate-at-low-hour", hourly, "2026-01-01T00:00");
    expect(impact).not.toBeNull();
    // (1 - 20 / 40) * 100 = 50%
    expect(impact?.value).toBe(50);
  });

  it("returns null when fewer than 2 qualifying waking hours exist", () => {
    const hourly: HourlyAir[] = [
      { time: "2026-01-01T03:00", usAqi: 20, pm25: 5 },
      { time: "2026-01-01T08:00", usAqi: 100, pm25: 40 },
    ];

    expect(timingImpact("shift-outdoor-activity", hourly, "2026-01-01T00:00")).toBeNull();
  });

  it("returns null when worst pm25 is 0", () => {
    const hourly: HourlyAir[] = [
      { time: "2026-01-01T08:00", usAqi: 0, pm25: 0 },
      { time: "2026-01-01T10:00", usAqi: 0, pm25: 0 },
    ];

    expect(timingImpact("ventilate-at-low-hour", hourly, "2026-01-01T00:00")).toBeNull();
  });

  it.each([
    ["05:00", 50],
    ["06:00", 75],
    ["21:00", 75],
    ["22:00", 50],
  ])("tests waking-window boundary for %s -> %s", (boundaryTime, expected) => {
    const hourly: HourlyAir[] = [
      { time: `2026-01-01T${boundaryTime}`, usAqi: 25, pm25: 10 },
      { time: "2026-01-01T12:00", usAqi: 50, pm25: 20 },
      { time: "2026-01-01T13:00", usAqi: 100, pm25: 40 },
    ];

    const impact = timingImpact("shift-outdoor-activity", hourly, "2026-01-01T00:00");
    expect(impact).not.toBeNull();
    expect(impact?.value).toBe(expected);
  });
});

describe("purifierImpact", () => {
  it("calculates 90% reduction for 12 m2 room with 200 m3/h CADR", () => {
    const impact = purifierImpact(12, 200);
    expect(impact.value).toBe(90);
    expect(impact.basis).toBe("rough estimate");
  });

  it("produces a larger reduction with a larger CADR", () => {
    const standard = purifierImpact(12, 200);
    const higherCadr = purifierImpact(12, 400);
    expect(higherCadr.value).toBeGreaterThan(standard.value);
  });

  it.each([
    [10, 100],
    [20, 250],
    [50, 400],
  ])("keeps value strictly between 0 and 100 for room=%s m2, cadr=%s m3/h", (area, cadr) => {
    const impact = purifierImpact(area, cadr);
    expect(impact.value).toBeGreaterThan(0);
    expect(impact.value).toBeLessThan(100);
  });
});

describe("avoidCarTripsImpact", () => {
  it.each([
    [10, 5, undefined, 100],
    [10, 5, 50, 5000],
  ])("computes private-vehicle km avoided for %s km, %s days/wk, %s households -> %s", (km, days, households, expected) => {
    const impact = households === undefined
      ? avoidCarTripsImpact(km, days)
      : avoidCarTripsImpact(km, days, households);
    expect(impact.value).toBe(expected);
    expect(impact.basis).toBe("arithmetic");
    expect(impact.unit).toBe("private-vehicle km avoided per week");
  });
});
