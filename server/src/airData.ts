import { getAirQuality } from "./openMeteo.js";

export async function loadAir(lat: number, lon: number) {
  return getAirQuality(lat, lon);
}
