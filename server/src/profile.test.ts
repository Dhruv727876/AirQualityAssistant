import { describe, it, expect } from "vitest";
import { profileSchema } from "./profile.js";

const validFamily = {
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
  cooking: "electric",
  roomAreaM2: 12,
  purifierCadrM3PerHour: 200,
  hasSensitiveMember: false,
  members: {
    adults: 2,
    children: 1,
    elderly: 0,
  },
};

const validCommunity = {
  mode: "community",
  location: {
    name: "Delhi",
    latitude: 28.61,
    longitude: 77.21,
  },
  commute: {
    mode: "public-transport",
    oneWayKm: 15,
    daysPerWeek: 5,
  },
  heating: "gas",
  cooking: "gas",
  roomAreaM2: 15,
  purifierCadrM3PerHour: 250,
  hasSensitiveMember: true,
  households: 50,
};

describe("profileSchema", () => {
  it("parses a valid family profile", () => {
    const result = profileSchema.safeParse(validFamily);
    expect(result.success).toBe(true);
  });

  it("parses a valid community profile", () => {
    const result = profileSchema.safeParse(validCommunity);
    expect(result.success).toBe(true);
  });

  it.each([
    {
      name: "unknown extra key",
      makeProfile: () => ({ ...validFamily, extraKey: "unexpected" }),
    },
    {
      name: "missing mode",
      makeProfile: () => {
        const copy: Record<string, unknown> = { ...validFamily };
        delete copy.mode;
        return copy;
      },
    },
    {
      name: "latitude 91",
      makeProfile: () => ({
        ...validFamily,
        location: { ...validFamily.location, latitude: 91 },
      }),
    },
    {
      name: "oneWayKm -1",
      makeProfile: () => ({
        ...validFamily,
        commute: { ...validFamily.commute, oneWayKm: -1 },
      }),
    },
    {
      name: "daysPerWeek 8",
      makeProfile: () => ({
        ...validFamily,
        commute: { ...validFamily.commute, daysPerWeek: 8 },
      }),
    },
    {
      name: "community households 1",
      makeProfile: () => ({
        ...validCommunity,
        households: 1,
      }),
    },
    {
      name: "family with a households key",
      makeProfile: () => ({
        ...validFamily,
        households: 5,
      }),
    },
    {
      name: "roomAreaM2 0",
      makeProfile: () => ({
        ...validFamily,
        roomAreaM2: 0,
      }),
    },
    {
      name: "purifierCadrM3PerHour 0",
      makeProfile: () => ({
        ...validFamily,
        purifierCadrM3PerHour: 0,
      }),
    },
  ])("rejects invalid profile: $name", ({ makeProfile }) => {
    const result = profileSchema.safeParse(makeProfile());
    expect(result.success).toBe(false);
  });
});
