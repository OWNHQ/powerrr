import type { Config } from "tailwindcss";

export default {
  content: [
    "./app.vue",
    "./components/**/*.{vue,ts}",
    "./composables/**/*.ts",
    "./pages/**/*.vue",
    "./server/**/*.ts",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#102223",
        paper: "#f6f8f8",
        mist: "#e4f1f1",
        line: "#d7e2e2",
        slate: "#486163",
        moss: "#4f7d3d",
        river: "#0b5d5f",
        own: "#0b5d5f",
        ownsoft: "#e4f1f1",
        coral: "#d85f49",
        gold: "#b58b2a",
      },
      boxShadow: {
        panel: "0 8px 28px rgb(16 34 35 / 0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
