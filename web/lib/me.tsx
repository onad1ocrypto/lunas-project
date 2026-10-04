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
  signOut: () => void;
  justSignedOut: boolean;
  clearJustSignedOut: () => void;
}
const MeCtx = createContext<Ctx | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<MeProfile>(ME_DEFAULT);
  const [justSignedOut, setJustSignedOut] = useState(false);

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

  /* Sign out for real: this demo keeps the identity only in localStorage, so signing
     out means forgetting the saved profile (name/handle/city/bio/tags edits included)
     and reporting the event so the UI can confirm it. Account-less by design: there is
     nothing else to revoke. */
  const signOut = useCallback(() => {
    setMeState(ME_DEFAULT);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable -> nothing saved to clear */
    }
    setJustSignedOut(true);
  }, []);

  const clearJustSignedOut = useCallback(() => setJustSignedOut(false), []);

  const value = useMemo<Ctx>(
    () => ({ me, setMe, signOut, justSignedOut, clearJustSignedOut }),
    [me, setMe, signOut, justSignedOut, clearJustSignedOut]
  );
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
