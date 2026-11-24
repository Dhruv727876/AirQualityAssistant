import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadProfile, saveProfile } from "./profile";
import { sampleProfile } from "./testData";

describe("profile", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
