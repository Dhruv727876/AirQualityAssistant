import { z } from "zod";

function isValidOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === value;
  } catch {
    return false;
  }
}

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  NVIDIA_API_KEY: z.string().min(1, "NVIDIA_API_KEY is required"),
  ALLOWED_ORIGINS: z
    .string()
    .min(1, "ALLOWED_ORIGINS is required")
    .transform((val) =>
      val
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    )
    .refine((origins) => origins.length > 0, {
      message: "ALLOWED_ORIGINS must contain at least one origin",
    })
    .refine((origins) => origins.every(isValidOrigin), {
      message: "ALLOWED_ORIGINS must be a comma-separated list of valid URL origins",
    }),
});

export type Config = z.infer<typeof configSchema> & {
  NODE_ENV?: string;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = configSchema.safeParse(env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join(", ");
    throw new Error(`Configuration error: ${errorDetails}`);
  }

  return result.data;
}
