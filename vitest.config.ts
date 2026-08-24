import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      include: ["packages/*/src/**/*.ts", "apps/website/utils/**/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 80,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@powerrr/shared-types": new URL(
        "./packages/shared-types/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/math": new URL("./packages/math/src/index.ts", import.meta.url)
        .pathname,
      "@powerrr/configs": new URL(
        "./packages/configs/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/protocol-adapters": new URL(
        "./packages/protocol-adapters/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
