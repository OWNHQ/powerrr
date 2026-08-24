// Dev-only allowance so Impeccable Live can load.
const __impeccableLiveDev =
  process.env.NODE_ENV === "development" ? " http://localhost:8400" : "";

const clarityProjectId = parseClarityProjectId(
  process.env.NUXT_PUBLIC_CLARITY_PROJECT_ID,
);
const clarityEnabled = Boolean(clarityProjectId);
const claritySources = "https://*.clarity.ms https://c.bing.com";
const connectSources = clarityEnabled ? `'self' ${claritySources}` : "'none'";
const scriptSources = clarityEnabled
  ? `'self' 'unsafe-inline' ${claritySources}`
  : "'self' 'unsafe-inline'";
const imageSources = clarityEnabled
  ? `'self' data: ${claritySources}`
  : "'self' data:";

function parseClarityProjectId(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;

  const projectId = value.trim();
  if (!/^[a-zA-Z0-9]+$/.test(projectId)) {
    throw new Error(
      "NUXT_PUBLIC_CLARITY_PROJECT_ID must contain only letters and numbers.",
    );
  }

  return projectId;
}

const clarityBootstrap = clarityProjectId
  ? `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};c[a]("consentv2",{ad_Storage:"denied",analytics_Storage:"denied"});t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityProjectId}");`
  : undefined;

export default defineNuxtConfig({
  compatibilityDate: "2026-07-01",
  ssr: false,
  app: {
    head: {
      title: "Powerrr",
      htmlAttrs: { lang: "en" },
      link: [{ rel: "icon", type: "image/svg+xml", href: "./favicon.svg" }],
      meta: [
        {
          name: "description",
          content:
            "Scan a connected Ethereum wallet through its own provider and calculate indicative collateral capacity locally.",
        },
        {
          "http-equiv": "Content-Security-Policy",
          content: `default-src 'self'; connect-src ${connectSources}${__impeccableLiveDev}; img-src ${imageSources}; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src ${scriptSources}${__impeccableLiveDev}; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'`,
        },
        { name: "referrer", content: "no-referrer" },
        { name: "color-scheme", content: "light" },
        { name: "theme-color", content: "#f3eee5" },
      ],
      script: clarityBootstrap
        ? [
            {
              innerHTML: clarityBootstrap,
            },
          ]
        : [],
    },
  },
  modules: ["@nuxtjs/tailwindcss", "@nuxt/eslint"],
  css: [
    "@fontsource-variable/inter/wght.css",
    "@fontsource/space-mono/400.css",
    "@fontsource/space-mono/700.css",
    "~/assets/css/tailwind.css",
  ],
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
