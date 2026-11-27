import { describe, it, expect, vi, afterEach } from "vitest";
import { createTtlCache } from "./ttlCache.js";

describe("createTtlCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for a missing key", () => {
    const cache = createTtlCache<string>(1000, 10);
    expect(cache.get("non-existent")).toBeUndefined();
  });

  it("returns the stored value before expiry", () => {
    const cache = createTtlCache<string>(1000, 10);
    cache.set("k1", "val1");
    expect(cache.get("k1")).toBe("val1");
  });

  it("returns undefined after expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));

    const cache = createTtlCache<string>(1000, 10);
    cache.set("k1", "val1");

    vi.setSystemTime(new Date("2026-01-01T10:00:02Z"));
    expect(cache.get("k1")).toBeUndefined();
  });

  it("evicts the oldest entry when maxEntries is exceeded and keeps the newer ones", () => {
    const cache = createTtlCache<string>(10000, 2);
    cache.set("k1", "val1");
    cache.set("k2", "val2");
    cache.set("k3", "val3");

    expect(cache.get("k1")).toBeUndefined();
    expect(cache.get("k2")).toBe("val2");
    expect(cache.get("k3")).toBe("val3");
  });
});
