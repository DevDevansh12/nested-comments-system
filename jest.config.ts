import type { Config } from "jest";

const config: Config = {
  // Use ts-jest so Jest understands TypeScript directly — no separate
  // compile step needed before running tests.
  preset: "ts-jest",

  // Node environment (not jsdom) — this is a backend project.
  testEnvironment: "node",

  // Where to find test files
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],

  // Map path aliases defined in tsconfig so imports work inside tests
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Show individual test names in output (easier to read coverage failures)
  verbose: true,

  // Collect coverage from the src/utils directory by default
  collectCoverageFrom: ["src/utils/**/*.ts", "!src/utils/**/*.d.ts"],
};

export default config;
