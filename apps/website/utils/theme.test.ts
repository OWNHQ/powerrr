import { describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  toggledTheme,
} from "./theme";

describe("theme preference", () => {
  it("accepts only explicit light and dark preferences", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("unknown")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  it("resolves system preference and toggles the effective theme", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(toggledTheme("light")).toBe("dark");
    expect(toggledTheme("dark")).toBe("light");
  });

  it("reads, writes, and safely ignores unavailable storage", () => {
    const storage = {
      getItem: vi.fn(() => "dark"),
      setItem: vi.fn(),
    };
    expect(readThemePreference(storage)).toBe("dark");
    storeThemePreference(storage, "light");
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "light");

    expect(
      readThemePreference({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: vi.fn(),
      }),
    ).toBe("system");
    expect(() =>
      storeThemePreference(
        {
          getItem: vi.fn(),
          setItem: () => {
            throw new Error("blocked");
          },
        },
        "dark",
      ),
    ).not.toThrow();
  });
});
