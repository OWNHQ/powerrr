import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

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
        ink: token("ink"),
        paper: token("paper"),
        surface: token("surface"),
        mist: token("mist"),
        line: token("line"),
        slate: token("slate"),
        moss: token("moss"),
        river: token("river"),
        own: token("own"),
        ownsoft: token("ownsoft"),
        coral: token("coral"),
        gold: token("gold"),
        "accent-contrast": token("accent-contrast"),
        overlay: token("overlay"),
        warning: {
          DEFAULT: token("warning-text"),
          surface: token("warning-surface"),
          border: token("warning-border"),
        },
        info: {
          DEFAULT: token("info-text"),
          surface: token("info-surface"),
        },
        danger: {
          DEFAULT: token("danger-text"),
          surface: token("danger-surface"),
        },
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
      },
    },
  },
  plugins: [],
} satisfies Config;
