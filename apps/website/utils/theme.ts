export const THEME_STORAGE_KEY = "powerrr-theme" as const;
export const LIGHT_THEME_COLOR = "#f6f8f8" as const;
export const DARK_THEME_COLOR = "#0b1415" as const;

export type ExplicitTheme = "light" | "dark";
export type ThemePreference = ExplicitTheme | "system";

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ExplicitTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function toggledTheme(current: ExplicitTheme): ExplicitTheme {
  return current === "dark" ? "light" : "dark";
}

export function readThemePreference(
  storage: ThemeStorage | null | undefined,
): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storeThemePreference(
  storage: ThemeStorage | null | undefined,
  theme: ExplicitTheme,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme selection remains active for this page when storage is unavailable.
  }
}
