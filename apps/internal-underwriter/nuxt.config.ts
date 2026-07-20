export default defineNuxtConfig({
  compatibilityDate: "2026-07-01",
  modules: ["@nuxt/eslint"],
  css: ["~/assets/css/app.css"],
  typescript: {
    strict: true,
    typeCheck: true,
  },
  runtimeConfig: {
    underwriterUsername: process.env.UNDERWRITER_USERNAME ?? "",
    underwriterPassword: process.env.UNDERWRITER_PASSWORD ?? "",
    public: {
      appName: process.env.NUXT_PUBLIC_INTERNAL_APP_NAME ?? "OWN Underwriter",
    },
  },
});
