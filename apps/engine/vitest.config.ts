import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@powerrr/shared-types": new URL(
        "../../packages/shared-types/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/schemas": new URL(
        "../../packages/schemas/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/math": new URL(
        "../../packages/math/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/fixtures": new URL(
        "../../packages/fixtures/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/portfolio": new URL(
        "../../packages/portfolio/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/protocol-adapters": new URL(
        "../../packages/protocol-adapters/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/engine-sdk": new URL(
        "../../packages/engine-sdk/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/clients": new URL(
        "../../packages/clients/src/index.ts",
        import.meta.url,
      ).pathname,
      "@powerrr/own-underwriter": new URL(
        "../../packages/own-underwriter/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
