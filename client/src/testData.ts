import type { Profile } from "./profile";
import type { Plan } from "./api";

export const sampleProfile: Profile = {
  mode: "family",
  location: {
    name: "Delhi",
    latitude: 28.61,
    longitude: 77.21,
  },
  commute: {
    mode: "car",
    oneWayKm: 10,
    daysPerWeek: 5,
  },
  heating: "electric",
  cooking: "gas",
  roomAreaM2: 20,
  hasSensitiveMember: true,
  members: {
    adults: 2,
    children: 1,
    elderly: 1,
  },
};

export const samplePlan: Plan = {
  generatedBy: "static",
  narrative: {
    summary: "Air quality requires care today. Reducing exposure protects health.",
    routine: [
      { period: "morning", advice: "Keep windows closed during peak morning traffic." },
    ],
    tips: [
      { title: "Indoor Plants", detail: "Plants do not replace ventilation or air purifiers." },
    ],
  },
  air: {
    time: "2026-01-10T10:00",
    usAqi: 228,
    pm25: 120,
    band: { label: "Very Unhealthy", level: 4 },
    whoRatio: 8,
  },
  verdict: {
    level: "limit-outdoors",
    headline: "Air is unhealthy; limit time outdoors and keep indoor air clean.",
    note: null,
  },
  hours: {
    best: { time: "2026-01-10T14:00", pm25: 45 },
    worst: { time: "2026-01-10T08:00", pm25: 150 },
  },
  actions: [
    {
      id: "n95-outdoors",
      title: "Wear an N95 outdoors",
      detail: "Fit tightly over mouth and nose.",
      because: "Air is unhealthy",
      impact: {
        lever: "n95-outdoors",
        value: 0.95,
        unit: "ratio",
        basis: "standard",
        assumptions: ["Proper fit"],
      },
    },
    {
      id: "air-purifier",
      title: "Run the purifier",
      detail: "Keep running in occupied room.",
      because: "Indoor air needs cleaning",
      impact: null,
    },
  ],
  disclaimer: "General information, not medical advice.",
};
