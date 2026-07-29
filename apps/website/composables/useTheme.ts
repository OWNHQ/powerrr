import {
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  THEME_STORAGE_KEY,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  toggledTheme,
  type ThemePreference,
} from "../utils/theme";

export function useTheme() {
  const preference = ref<ThemePreference>("system");
  const systemDark = ref(false);
  const effectiveTheme = computed(() =>
    resolveTheme(preference.value, systemDark.value),
  );
  const isDark = computed(() => effectiveTheme.value === "dark");
  const toggleLabel = computed(() =>
    isDark.value ? "Switch to light mode" : "Switch to dark mode",
  );
  let mediaQuery: MediaQueryList | null = null;

  function applyTheme(): void {
    if (preference.value === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = preference.value;
    }
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    themeColor?.setAttribute(
      "content",
      isDark.value ? DARK_THEME_COLOR : LIGHT_THEME_COLOR,
    );
  }

  function toggleTheme(): void {
    const next = toggledTheme(effectiveTheme.value);
    preference.value = next;
    storeThemePreference(window.localStorage, next);
    applyTheme();
  }

  function handleSystemTheme(event: MediaQueryListEvent): void {
    systemDark.value = event.matches;
    if (preference.value === "system") applyTheme();
  }

  function handleStorage(event: StorageEvent): void {
    if (event.key !== THEME_STORAGE_KEY) return;
    preference.value = parseThemePreference(event.newValue);
    applyTheme();
  }

  onMounted(() => {
    mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
    systemDark.value = mediaQuery?.matches ?? false;
    preference.value = readThemePreference(window.localStorage);
    applyTheme();
    mediaQuery?.addEventListener?.("change", handleSystemTheme);
    window.addEventListener("storage", handleStorage);
  });

  onBeforeUnmount(() => {
    mediaQuery?.removeEventListener?.("change", handleSystemTheme);
    window.removeEventListener("storage", handleStorage);
  });

  return { effectiveTheme, isDark, preference, toggleLabel, toggleTheme };
}
