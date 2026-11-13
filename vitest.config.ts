import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    restoreMocks: true,
    // The timed budget test renders 2,000 components x 30 rounds; give it room
    // on a slow CI runner rather than letting a timeout read as a budget breach.
    testTimeout: 120_000,
  },
});
