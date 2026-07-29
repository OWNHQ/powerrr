export default defineNuxtConfig({
  compatibilityDate: "2026-07-01",
  ssr: false,
  serverDir: "static-server",
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
          content:
            "default-src 'self'; connect-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'",
        },
        { name: "referrer", content: "no-referrer" },
        { name: "color-scheme", content: "light dark" },
        { name: "theme-color", content: "#f6f8f8" },
      ],
      script: [
        {
          innerHTML:
            "(function(){try{var t=localStorage.getItem('powerrr-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var m=document.querySelector('meta[name=theme-color]');if(m)m.content=d?'#0b1415':'#f6f8f8';}catch(e){}})();",
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
