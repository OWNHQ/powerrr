// Dev-only allowance so Impeccable Live can load.
const __impeccableLiveDev =
  process.env.NODE_ENV === "development" ? " http://localhost:8400" : "";

export default defineNuxtConfig({
  compatibilityDate: "2026-07-01",
  ssr: false,
  app: {
    head: {
      title: "Powerrr — private Ethereum collateral scan",
      htmlAttrs: { lang: "en" },
      meta: [
        {
          name: "description",
          content:
            "Scan a connected Ethereum wallet through its own provider and calculate indicative collateral capacity locally.",
        },
        {
          "http-equiv": "Content-Security-Policy",
          content: `default-src 'self'; connect-src 'none'${__impeccableLiveDev}; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${__impeccableLiveDev}; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'`,
        },
        { name: "referrer", content: "no-referrer" },
        { name: "color-scheme", content: "light" },
        { name: "theme-color", content: "#f3eee5" },
      ],
    },
  },
  modules: ["@nuxtjs/tailwindcss", "@nuxt/eslint"],
  css: ["@fontsource-variable/inter/wght.css", "~/assets/css/tailwind.css"],
  typescript: {
    strict: true,
    typeCheck: true,
  },
  nitro: {
    preset: "static",
    prerender: {
      routes: ["/"],
    },
  },
  devtools: {
    enabled: false,
  },
});
