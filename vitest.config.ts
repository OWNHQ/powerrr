import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      include: [
        "packages/*/src/**/*.ts",
        "apps/website/server/utils/**/*.ts",
        "apps/website/utils/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/fixtures/**"],
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@powerrr/shared-types": new URL(
        "./packages/shared-types/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/schemas": new URL(
        "./packages/schemas/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/math": new URL("./packages/math/src/index.ts", import.meta.url)
        .pathname,
      "@powerrr/fixtures": new URL(
        "./packages/fixtures/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/portfolio": new URL(
        "./packages/portfolio/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/protocol-adapters": new URL(
        "./packages/protocol-adapters/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/own-underwriter": new URL(
        "./packages/own-underwriter/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
