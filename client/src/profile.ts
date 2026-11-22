import { z } from "zod";

const sharedBase = z.strictObject({
  location: z.strictObject({
    name: z.string().trim().min(1).max(100),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  commute: z.strictObject({
    mode: z.enum(["car", "two-wheeler", "public-transport", "walk-cycle", "remote"]),
    oneWayKm: z.number().min(0).max(200),
    daysPerWeek: z.number().int().min(0).max(7),
  }),
  heating: z.enum(["electric", "gas", "wood-or-coal", "none"]),
  cooking: z.enum(["electric", "gas", "wood-or-coal"]),
  roomAreaM2: z.number().min(4).max(200),
  purifierCadrM3PerHour: z.number().min(10).max(1000).optional(),
  hasSensitiveMember: z.boolean(),
});

const familyProfileSchema = sharedBase.extend({
  mode: z.literal("family"),
  members: z.strictObject({
    adults: z.number().int().min(1).max(10),
    children: z.number().int().min(0).max(10),
    elderly: z.number().int().min(0).max(10),
  }),
});

const communityProfileSchema = sharedBase.extend({
  mode: z.literal("community"),
  households: z.number().int().min(2).max(10000),
});

export const profileSchema = z.discriminatedUnion("mode", [
  familyProfileSchema,
  communityProfileSchema,
]);

export type Profile = z.infer<typeof profileSchema>;

const PROFILE_STORAGE_KEY = "air_quality_profile";

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    const result = profileSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // WHY: Storage quotas or browser privacy blocking must not break application operation.
  }
}
