import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
      exclude: [
        "dist/**",
        "**/*.test.ts",
        "vitest.config.ts",
        "src/server.ts",
      ],
    },
  },
});

