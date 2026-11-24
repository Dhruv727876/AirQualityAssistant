import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      // WHY: main.tsx is the app entry point; testData and testUtils are test fixtures and helpers.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/main.tsx",
        "src/testData.ts",
        "src/testUtils.ts",
      ],
      thresholds: {
        lines: 99,
        functions: 99,
        statements: 99,
        branches: 89,
      },
    },
  },
});

