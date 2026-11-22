import type { Profile } from "./profile.js";
import type { HourlyAir } from "./openMeteo.js";
import type { Narrative } from "./narrative.js";
import {
  type Impact,
  type Lever,
  maskImpact,
  timingImpact,
  purifierImpact,
  avoidCarTripsImpact,
  whoRatio,
  wakingExtremes,
  formatWhen,
} from "./impact.js";

export type ActionId = Lever | "cleaner-heating" | "cleaner-cooking";

export type VerdictLevel = "go" | "caution" | "limit-outdoors" | "unknown";

export interface Verdict {
  level: VerdictLevel;
  headline: string;
  note: string | null;
}

// The plan does not read pm10, and the /api/air response satisfies this type structurally.
export interface PlanAir {
  current: {
    time: string;
    usAqi: number | null;
    pm25: number | null;
    band: { label: string; level: number } | null;
  };
  hourly: HourlyAir[];
}

interface Action {
  id: ActionId;
  title: string;
  detail: string;
  because: string;
  impact: Impact | null;
}

export type GeneratedBy = "static" | "gemini" | "nvidia";

export interface Plan {
  generatedBy: GeneratedBy;
  narrative: Narrative | null;
  air: {
    time: string;
    usAqi: number | null;
    pm25: number | null;
    band: { label: string; level: number } | null;
    whoRatio: number | null;
  };
  verdict: Verdict;
  hours: {
    best: { time: string; pm25: number };
    worst: { time: string; pm25: number };
  } | null;
  actions: Action[];
  disclaimer: string;
}

const DISCLAIMER =
  "General information, not medical advice. If you have symptoms or a health condition, follow your doctor's guidance.";

const HEADLINES: Record<VerdictLevel, string> = {
  go: "Air is fine for normal outdoor plans.",
  caution: "Air is unhealthy for some people; keep outdoor time short and choose your hours.",
  "limit-outdoors": "Air is unhealthy; limit time outdoors and keep indoor air clean.",
  unknown: "Live air data is incomplete for this hour; plan cautiously.",
};

const VERDICT_THRESHOLDS = {
  general: { go: 100, caution: 150 },
  sensitive: { go: 50, caution: 100 },
};

function verdictFor(
  usAqi: number | null,
  sensitive: boolean,
  isCommunity: boolean
): Verdict {
  let level: VerdictLevel;

  if (usAqi === null) {
    level = "unknown";
  } else {
    const thresholds = sensitive
      ? VERDICT_THRESHOLDS.sensitive
      : VERDICT_THRESHOLDS.general;

    if (usAqi <= thresholds.go) {
      level = "go";
    } else if (usAqi <= thresholds.caution) {
      level = "caution";
    } else {
      level = "limit-outdoors";
    }
  }

  let note: string | null = null;
  if (sensitive) {
    note = isCommunity
      ? "This plan treats the community as including sensitive groups, so the thresholds are stricter."
      : "Your household includes children, older adults or someone sensitive to air pollution, so the thresholds are stricter.";
  }

  return {
    level,
    headline: HEADLINES[level],
    note,
  };
}

export function buildPlan(profile: Profile, air: PlanAir): Plan {
  const isCommunity = profile.mode === "community";
  const sensitive = isCommunity
    ? true
    : profile.members.children > 0 ||
      profile.members.elderly > 0 ||
      profile.hasSensitiveMember;

  const verdict = verdictFor(air.current.usAqi, sensitive, isCommunity);
  const airDriven = verdict.level === "caution" || verdict.level === "limit-outdoors";

  const extremes = wakingExtremes(air.hourly);
  const hours = extremes
    ? {
        best: { time: extremes.best.time, pm25: extremes.best.pm25 },
        worst: { time: extremes.worst.time, pm25: extremes.worst.pm25 },
      }
    : null;

  const actions: Action[] = [];

  if (airDriven) {
    actions.push({
      id: "n95-outdoors",
      title: "Wear an N95 mask outdoors",
      detail: "Wear a well-fitted N95 mask when spending extended time outside to filter fine particles.",
      because: `Today's US AQI is ${air.current.usAqi}`,
      impact: maskImpact(),
    });
  }

  if (airDriven && extremes !== null) {
    const shiftImpact = timingImpact(
      "shift-outdoor-activity",
      air.hourly,
      air.current.time
    );
    if (shiftImpact !== null) {
      const bestWhen = formatWhen(extremes.best, air.current.time);
      const worstWhen = formatWhen(extremes.worst, air.current.time);

      actions.push({
        id: "shift-outdoor-activity",
        title: "Shift outdoor activities to cleaner hours",
        detail: `Shift outdoor exercise, errands or walks to ${bestWhen}, when forecast PM2.5 is lowest. That is relatively cleaner, not necessarily clean, so check the live reading first.`,
        because: `Forecast PM2.5 is lowest ${bestWhen} and highest ${worstWhen}`,
        impact: shiftImpact,
      });

      actions.push({
        id: "ventilate-at-low-hour",
        title: "Ventilate during cleaner hours",
        detail: `Open windows ${bestWhen}, when outdoor PM2.5 is forecast to be lowest, and keep them closed ${worstWhen}. If the air outside is still unhealthy then, keep windows closed.`,
        because: `Forecast PM2.5 is lowest ${bestWhen} and highest ${worstWhen}`,
        impact: {
          ...shiftImpact,
          lever: "ventilate-at-low-hour",
        },
      });
    }
  }

  if (airDriven && profile.purifierCadrM3PerHour !== undefined) {
    actions.push({
      id: "air-purifier",
      title: "Run your indoor air purifier",
      detail: "Run the purifier continuously in your main room with windows and doors closed.",
      because: `Your purifier has a CADR of ${profile.purifierCadrM3PerHour} m³/h for a ${profile.roomAreaM2} m² room`,
      impact: purifierImpact(profile.roomAreaM2, profile.purifierCadrM3PerHour),
    });
  }

  const isVehicleCommute =
    profile.commute.mode === "car" || profile.commute.mode === "two-wheeler";
  if (
    isVehicleCommute &&
    profile.commute.oneWayKm > 0 &&
    profile.commute.daysPerWeek > 0
  ) {
    const households = isCommunity ? profile.households : 1;
    const becauseStr = isCommunity
      ? `Your community commutes by ${profile.commute.mode} across ${profile.households} households (${profile.commute.oneWayKm} km one-way, ${profile.commute.daysPerWeek} days/week)`
      : `You commute by ${profile.commute.mode} (${profile.commute.oneWayKm} km one-way, ${profile.commute.daysPerWeek} days/week)`;

    actions.push({
      id: "avoid-car-trips",
      title: "Replace vehicle trips with cleaner transport",
      detail: `If you swap all ${profile.commute.daysPerWeek} commuting days to remote work, walking, cycling or public transport, those vehicle kilometres are avoided.`,
      because: becauseStr,
      impact: avoidCarTripsImpact(
        profile.commute.oneWayKm,
        profile.commute.daysPerWeek,
        households
      ),
    });
  }

  if (profile.heating === "wood-or-coal") {
    actions.push({
      id: "cleaner-heating",
      title: "Switch to cleaner heating sources",
      detail: "Avoid burning wood or coal indoors to reduce high local particulate concentrations.",
      because: "You heat with wood or coal",
      impact: null,
    });
  }

  if (profile.cooking === "wood-or-coal") {
    actions.push({
      id: "cleaner-cooking",
      title: "Switch to cleaner cooking fuels",
      detail: "Transition from solid fuels to electric or gas cooking to reduce indoor smoke.",
      because: "You cook with wood or coal",
      impact: null,
    });
  }

  return {
    generatedBy: "static",
    narrative: null,
    air: {
      time: air.current.time,
      usAqi: air.current.usAqi,
      pm25: air.current.pm25,
      band: air.current.band,
      whoRatio: whoRatio(air.current.pm25),
    },
    verdict,
    hours,
    actions,
    disclaimer: DISCLAIMER,
  };
}
