import {
  DEFAULT_INTERNAL_API_TOKEN,
  DEFAULT_INTERNAL_SIGNING_SECRET,
} from "./server/utils/internal-auth-core";

const production = process.env.NODE_ENV === "production";

export default defineNuxtConfig({
  compatibilityDate: "2026-07-01",
  app: {
    head: {
      title: "Powerrr — Wallet borrowing estimate",
      htmlAttrs: {
        lang: "en",
      },
      meta: [
        {
          name: "description",
          content:
            "Compare estimated USDC borrowing power and risk for supported Ethereum wallet collateral.",
        },
      ],
    },
  },
  modules: ["@nuxtjs/tailwindcss", "@nuxt/eslint"],
  css: ["~/assets/css/tailwind.css"],
  typescript: {
    strict: true,
    typeCheck: true,
  },
  runtimeConfig: {
    powerrrDataMode:
      process.env.NUXT_POWERRR_DATA_MODE ??
      process.env.POWERRR_DATA_MODE ??
      (production ? "live" : "fixtures"),
    powerrrRuntimeTier:
      process.env.POWERRR_RUNTIME_TIER ??
      (production ? "public-rpc-preview" : "fixture"),
    powerrrInternalApiToken:
      process.env.POWERRR_INTERNAL_API_TOKEN ??
      (production ? "" : DEFAULT_INTERNAL_API_TOKEN),
    powerrrInternalSigningSecret:
      process.env.POWERRR_INTERNAL_SIGNING_SECRET ??
      (production ? "" : DEFAULT_INTERNAL_SIGNING_SECRET),
    ethereumRpcUrl:
      process.env.NUXT_ETHEREUM_RPC_URL ?? process.env.ETHEREUM_RPC_URL ?? "",
    powerrrRpcAuthenticated: process.env.POWERRR_RPC_AUTHENTICATED ?? "false",
    aaveV3GraphqlUrl: process.env.AAVE_V3_GRAPHQL_URL ?? "",
    aaveV4GraphqlUrl: process.env.AAVE_V4_GRAPHQL_URL ?? "",
    morphoGraphqlUrl:
      process.env.NUXT_MORPHO_GRAPHQL_URL ??
      process.env.MORPHO_GRAPHQL_URL ??
      "",
    eulerDataUrl: process.env.EULER_DATA_URL ?? "",
    sparkDataUrl: process.env.SPARK_DATA_URL ?? "",
    alchemyApiKey: process.env.ALCHEMY_API_KEY ?? "",
    sourceClientTimeoutMs:
      process.env.POWERRR_SOURCE_CLIENT_TIMEOUT_MS ?? "2500",
    ownAvailableLiquidityUsd: process.env.OWN_AVAILABLE_LIQUIDITY_USD ?? "0",
    ownIndicativeApr: process.env.OWN_INDICATIVE_APR ?? "0.095",
    ownTermMonths: process.env.OWN_TERM_MONTHS ?? "24",
    ownLeadWebhookUrl: process.env.OWN_LEAD_WEBHOOK_URL ?? "",
    ownLeadWebhookSecret: process.env.OWN_LEAD_WEBHOOK_SECRET ?? "",
    ownLeadWebhookTimeoutMs: process.env.OWN_LEAD_WEBHOOK_TIMEOUT_MS ?? "5000",
    ownLeadDevelopmentMock:
      process.env.NUXT_OWN_LEAD_DEVELOPMENT_MOCK ??
      process.env.OWN_LEAD_DEVELOPMENT_MOCK ??
      (production ? "false" : "true"),
    public: {
      siteName: process.env.NUXT_PUBLIC_SITE_NAME ?? "Powerrr",
      powerrrDataMode:
        process.env.NUXT_PUBLIC_POWERRR_DATA_MODE ??
        process.env.POWERRR_DATA_MODE ??
        (production ? "live" : "fixtures"),
    },
  },
  nitro: {
    routeRules: {
      "/**": {
        headers: {
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "camera=(), microphone=(), geolocation=()",
          "x-frame-options": "DENY",
        },
      },
    },
    experimental: {
      openAPI: true,
    },
  },
  devtools: {
    enabled: false,
  },
});
