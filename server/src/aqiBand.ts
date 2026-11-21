export interface AqiBand {
  label: string;
  level: number;
}

const BANDS = [
  { max: 50, label: "Good" },
  { max: 100, label: "Moderate" },
  { max: 150, label: "Unhealthy for Sensitive Groups" },
  { max: 200, label: "Unhealthy" },
  { max: 300, label: "Very Unhealthy" },
  { max: Infinity, label: "Hazardous" },
];

// US EPA AQI categories; boundaries are by definition
export function aqiBand(usAqi: number | null): AqiBand | null {
  if (usAqi === null) {
    return null;
  }

  const level = BANDS.findIndex((band) => usAqi <= band.max);
  return { label: BANDS[level].label, level };
}
