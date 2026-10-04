"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface MeProfile {
  name: string;
  handle: string;
  city: string;
  country: string;
  bio: string;
  tags: string[];
}

export const ME_COLOR = "var(--peach-l)";

export const ME_DEFAULT: MeProfile = {
  name: "Sari Wulandari",
  handle: "sari",
  city: "Yogyakarta",
  country: "ID",
  bio: "Product photo editor & designer from Yogyakarta. I make online shops look delicious. 6 years, 86 happy clients, zero drama.",
  tags: ["Photo editing", "Social media design", "Logos", "Etsy & Shopify"],
};

const STORAGE_KEY = "lunas.me";

interface Ctx {
  me: MeProfile;
  setMe: (p: MeProfile) => void;
}
const MeCtx = createContext<Ctx | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<MeProfile>(ME_DEFAULT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<MeProfile>;
        setMeState({
          ...ME_DEFAULT,
          ...p,
          tags: Array.isArray(p.tags) ? p.tags.filter((x) => typeof x === "string") : ME_DEFAULT.tags,
        });
      }
    } catch {
      /* corrupted storage -> defaults */
    }
  }, []);

  const setMe = useCallback((p: MeProfile) => {
    setMeState(p);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* storage unavailable (private mode) -> in-memory only */
    }
  }, []);

  const value = useMemo<Ctx>(() => ({ me, setMe }), [me, setMe]);
  return <MeCtx.Provider value={value}>{children}</MeCtx.Provider>;
}

export function useMe() {
  const ctx = useContext(MeCtx);
  if (!ctx) throw new Error("useMe must be used inside <MeProvider>");
  return ctx;
}

/** "Sari Wulandari" -> "SW"; single word -> first letter doubled-safe fallback. */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "ME";
  const a = w[0][0] ?? "";
  const b = w.length > 1 ? w[w.length - 1][0] ?? "" : "";
  return (a + b).toUpperCase() || "ME";
}
