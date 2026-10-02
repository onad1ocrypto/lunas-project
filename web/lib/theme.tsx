"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeCode = "candy" | "midnight" | "matcha";

export const THEMES: { code: ThemeCode; dots: [string, string, string] }[] = [
  { code: "candy", dots: ["#fff7ec", "#ff8fb1", "#ffd84d"] },
  { code: "midnight", dots: ["#171233", "#b79cff", "#ffd84d"] },
  { code: "matcha", dots: ["#f2f7e8", "#6edca8", "#ffd84d"] },
];

interface Ctx {
  theme: ThemeCode;
  setTheme: (t: ThemeCode) => void;
}
const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "lunas.theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeCode>("candy");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeCode | null;
    if (saved && THEMES.some((t) => t.code === saved)) setThemeState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((t: ThemeCode) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  const value = useMemo<Ctx>(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
