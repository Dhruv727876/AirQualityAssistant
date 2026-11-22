import type { HourlyAir } from "./openMeteo.js";

export type Basis = "standard" | "forecast" | "arithmetic" | "rough estimate";

export type Lever =
  | "n95-outdoors"
  | "shift-outdoor-activity"
  | "ventilate-at-low-hour"
  | "air-purifier"
  | "avoid-car-trips";

export interface Impact {
  lever: Lever;
  value: number;
  unit: string;
  basis: Basis;
  source?: string;
  assumptions: string[];
}

export interface HourReading {
  time: string;
  hour: number;
  pm25: number;
}

const COEFFICIENTS: {
  n95Filtration: { value: number; basis: Basis; source: string };
  whoPm25Guideline24h: { value: number; source: string };
  ceilingHeightM: { value: number };
  roomAirChangeRate: { value: number };
  particleDepositionRate: { value: number };
  wakingHours: { start: number; end: number };
} = {
  n95Filtration: {
    value: 0.95,
    basis: "standard",
    source:
      "NIOSH N95 respirator certification, 42 CFR Part 84 (95% minimum filtration of the test aerosol)",
  },
  whoPm25Guideline24h: {
    value: 15,
    source: "WHO global air quality guidelines, 2021 (24-hour guideline level)",
  },
  // Rough estimates with no citable source (see README)
  ceilingHeightM: {
    value: 2.5,
  },
  roomAirChangeRate: {
    value: 0.5,
  },
  particleDepositionRate: {
    value: 0.2,
  },
  wakingHours: {
    start: 6,
    end: 21,
  },
};

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function wakingExtremes(
  hourly: HourlyAir[]
): { best: HourReading; worst: HourReading } | null {
  const waking = COEFFICIENTS.wakingHours;
  const qualifying: HourReading[] = [];

  for (const entry of hourly) {
    if (entry.pm25 === null) {
      continue;
    }
    const hour = Number(entry.time.slice(11, 13));
    if (hour >= waking.start && hour <= waking.end) {
      qualifying.push({ time: entry.time, hour, pm25: entry.pm25 });
    }
  }

  if (qualifying.length < 2) {
    return null;
  }

  let best = qualifying[0];
  let worst = qualifying[0];

  for (let i = 1; i < qualifying.length; i++) {
    const item = qualifying[i];
    if (item.pm25 < best.pm25) {
      best = item;
    }
    if (item.pm25 > worst.pm25) {
      worst = item;
    }
  }

  return { best, worst };
}

export function whoRatio(pm25: number | null): number | null {
  if (pm25 === null) {
    return null;
  }
  return Math.round((pm25 / COEFFICIENTS.whoPm25Guideline24h.value) * 10) / 10;
}

export function maskImpact(): Impact {
  return {
    lever: "n95-outdoors",
    value: Math.round(COEFFICIENTS.n95Filtration.value * 100),
    unit: "% of fine particles filtered (up to)",
    basis: COEFFICIENTS.n95Filtration.basis,
    source: COEFFICIENTS.n95Filtration.source,
    assumptions: ["Assumes a tight seal; real-world protection is lower"],
  };
}

export function timingImpact(
  lever: "shift-outdoor-activity" | "ventilate-at-low-hour",
  hourly: HourlyAir[]
): Impact | null {
  const extremes = wakingExtremes(hourly);
  if (!extremes) {
    return null;
  }

  const { best, worst } = extremes;
  if (worst.pm25 === 0) {
    return null;
  }

  const value = Math.round((1 - best.pm25 / worst.pm25) * 100);
  const waking = COEFFICIENTS.wakingHours;

  return {
    lever,
    value,
    unit: "% lower PM2.5 at the best waking hour than at the worst",
    basis: "forecast",
    source: "Open-Meteo Air Quality API (Copernicus CAMS model)",
    assumptions: [
      `Forecast: ${best.pm25} µg/m³ at ${formatHour(best.hour)} vs ${worst.pm25} µg/m³ at ${formatHour(worst.hour)}`,
      `Waking-hours window: ${formatHour(waking.start)} to ${formatHour(waking.end)}`,
      "Modelled forecast on a coarse grid; conditions on your street can differ",
    ],
  };
}

export function purifierImpact(roomAreaM2: number, cadrM3PerHour: number): Impact {
  const ceilingHeightM = COEFFICIENTS.ceilingHeightM.value;
  const a = COEFFICIENTS.roomAirChangeRate.value;
  const k = COEFFICIENTS.particleDepositionRate.value;

  const V = roomAreaM2 * ceilingHeightM;
  const q = cadrM3PerHour / V;

  // Steady-state well-mixed mass balance: removal efficiency = filtration rate / total loss rate
  const value = Math.round((100 * q) / (a + k + q));

  return {
    lever: "air-purifier",
    value,
    unit: "% lower indoor PM2.5 than the same room without it (steady state)",
    basis: "rough estimate",
    assumptions: [
      `Room volume: ${V} m³ (${roomAreaM2} m² area × ${ceilingHeightM} m ceiling height)`,
      `Clean Air Delivery Rate (CADR): ${cadrM3PerHour} m³/h`,
      `Air exchange rate (a): ${a} /h, particle deposition rate (k): ${k} /h`,
      "Assumes well-mixed air and a purifier running continuously",
    ],
  };
}

export function avoidCarTripsImpact(
  oneWayKm: number,
  daysPerWeek: number,
  households = 1
): Impact {
  const value = Math.round(oneWayKm * 2 * daysPerWeek * households);

  return {
    lever: "avoid-car-trips",
    value,
    unit: "private-vehicle km avoided per week",
    basis: "arithmetic",
    assumptions: [
      "Counts only the kilometres you stop driving; tailpipe emissions per kilometre are not quantified here",
    ],
  };
}
