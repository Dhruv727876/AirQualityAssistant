import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadProfile, saveProfile, type Profile } from "./profile";

describe("profile", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleProfile: Profile = {
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

  it("save then load round-trips", () => {
    saveProfile(sampleProfile);
    expect(loadProfile()).toEqual(sampleProfile);
  });

  it("missing key returns null", () => {
    expect(loadProfile()).toBeNull();
  });

  it("invalid JSON returns null", () => {
    localStorage.setItem("air_quality_profile", "invalid-json{");
    expect(loadProfile()).toBeNull();
  });

  it("schema-invalid data returns null", () => {
    localStorage.setItem("air_quality_profile", JSON.stringify({ mode: "unknown" }));
    expect(loadProfile()).toBeNull();
  });

  it("a throwing setItem does not throw", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => saveProfile(sampleProfile)).not.toThrow();
  });
});
