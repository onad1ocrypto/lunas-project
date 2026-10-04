"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ME_PROFILE_FALLBACK,
  sanitizeProfile,
  type MePortfolioItem,
  type MeProfile,
  type MeSocials,
} from "./profile";

/* Re-exported so existing imports from "@/lib/me" keep working. */
export { countryName, hostOf, locationOf, MAX_PORTFOLIO, normalizeUrl, SOCIAL_KEYS } from "./profile";
export type { MePortfolioItem, MeProfile, MeSocials, SocialKey } from "./profile";

export const ME_COLOR = "var(--peach-l)";

/** Guest persona — what every visitor gets without signing in. Editable like any profile. */
export const ME_DEFAULT: MeProfile = ME_PROFILE_FALLBACK;

/** What PayPal tells us after the user consents (Identity API / OpenID Connect). */
export interface PayPalIdentity {
  payerId: string; // PayPal account id — also valid as a Payouts receiver
  email: string;
  name: string;
  country?: string;
}

export interface Session {
  mode: "guest" | "paypal";
  paypal?: PayPalIdentity;
  paypalLoginAvailable?: boolean;
}

/* One profile per identity: the guest profile and each PayPal account keep their own edits. */
const LEGACY_KEY = "lunas.me";
const PROFILES_KEY = "lunas.profiles";
const keyOf = (id: string) => `${PROFILES_KEY}.${id}`;
const identityOf = (s: Session) => (s.mode === "paypal" && s.paypal ? `pp.${s.paypal.payerId}` : "guest");

/** A PayPal sign-in fills what PayPal knows; everything else is for the user to complete. */
export function profileFromPayPal(p: PayPalIdentity): MeProfile {
  const local = (p.email.split("@")[0] || "").trim();
  const handle = local.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return {
    name: p.name?.trim() || local || "PayPal user",
    handle: handle || "me",
    city: "",
    country: (p.country || "").slice(0, 2).toUpperCase(),
    bio: "",
    tags: [],
  };
}

function parseStored(raw: string, fallback: MeProfile): MeProfile {
  try {
    return sanitizeProfile(JSON.parse(raw), fallback);
  } catch {
    return fallback;
  }
}

/** Demo defaults from earlier versions: demo data, not a user edit, so they may be replaced. */
function isStaleDefault(p: MeProfile | null | undefined): boolean {
  if (!p) return false;
  return (
    (p.name === "Sari Wulandari" && p.city === "Yogyakarta") ||
    (p.name === "SASAM" && p.city === "Wonogiri")
  );
}

function readProfile(session: Session): MeProfile {
  const fallback = session.mode === "paypal" && session.paypal ? profileFromPayPal(session.paypal) : ME_DEFAULT;
  if (typeof window === "undefined") return fallback;
  try {
    const key = keyOf(identityOf(session));
    const raw = localStorage.getItem(key);
    if (raw) {
      const stored = parseStored(raw, fallback);
      /* A browser that saved the *old* demo default (e.g. SASAM / Wonogiri) keeps showing
         it otherwise — the persona changed, so drop it and use the current one. */
      if (!isStaleDefault(stored)) return stored;
      localStorage.removeItem(key);
      return fallback;
    }
    /* one-time migration from the single-profile layout used before sign-in existed.
       Stale *default* personas (Sari Wulandari / Yogyakarta, SASAM / Wonogiri) are demo
       data, not user edits, so they are dropped in favour of the current persona. */
    if (session.mode === "guest") {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const migrated = parseStored(legacy, fallback);
        localStorage.removeItem(LEGACY_KEY);
        if (migrated && !isStaleDefault(migrated)) {
          localStorage.setItem(key, JSON.stringify(migrated));
          return migrated;
        }
      }
    }
  } catch {
    /* private mode / corrupt storage -> defaults */
  }
  return fallback;
}

interface Ctx {
  me: MeProfile;
  setMe: (p: MeProfile) => void;
  session: Session;
  sessionReady: boolean;
  signInWithPayPal: () => void;
  signInAsGuest: () => void;
  signOut: () => void;
  justSignedOut: boolean;
  clearJustSignedOut: () => void;
}

const MeCtx = createContext<Ctx | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<MeProfile>(ME_DEFAULT);
  const [session, setSession] = useState<Session>({ mode: "guest" });
  const [sessionReady, setSessionReady] = useState(false);
  const [justSignedOut, setJustSignedOut] = useState(false);

  /* Ask the server who we are: guest, or the PayPal account in the signed cookie. */
  useEffect(() => {
    let alive = true;
    (async () => {
      let s: Session = { mode: "guest" };
      try {
        const r = await fetch("/api/auth/session", { cache: "no-store" });
        if (r.ok) s = (await r.json()) as Session;
      } catch {
        /* offline / API error -> stay guest */
      }
      if (!alive) return;
      setSession(s);
      setMeState(readProfile(s));
      setSessionReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setMe = useCallback(
    (p: MeProfile) => {
      setMeState(p);
      try {
        localStorage.setItem(keyOf(identityOf(session)), JSON.stringify(p));
      } catch {
        /* storage unavailable (private mode) -> in-memory only */
      }
    },
    [session]
  );

  const signInWithPayPal = useCallback(() => {
    window.location.href = "/api/auth/paypal/start";
  }, []);

  /* Back to guest mode: forget the server session and this device's demo profile. */
  const signOut = useCallback(() => {
    void fetch("/api/auth/signout", { method: "POST", cache: "no-store" }).catch(() => {});
    try {
      localStorage.removeItem(keyOf("guest"));
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* nothing to clear */
    }
    setSession({ mode: "guest" });
    setMeState(ME_DEFAULT);
    setJustSignedOut(true);
  }, []);

  /* "Continue as guest" from the sign-in page: same as sign-out, without the farewell toast. */
  const signInAsGuest = useCallback(() => {
    void fetch("/api/auth/signout", { method: "POST", cache: "no-store" }).catch(() => {});
    setSession({ mode: "guest" });
    setMeState(readProfile({ mode: "guest" }));
  }, []);

  const clearJustSignedOut = useCallback(() => setJustSignedOut(false), []);

  const value = useMemo<Ctx>(
    () => ({ me, setMe, session, sessionReady, signInWithPayPal, signInAsGuest, signOut, justSignedOut, clearJustSignedOut }),
    [me, setMe, session, sessionReady, signInWithPayPal, signInAsGuest, signOut, justSignedOut, clearJustSignedOut]
  );
  return <MeCtx.Provider value={value}>{children}</MeCtx.Provider>;
}

export function useMe() {
  const ctx = useContext(MeCtx);
  if (!ctx) throw new Error("useMe must be used inside <MeProvider>");
  return ctx;
}

/** "SASAM" -> "S"; "Sari Wulandari" -> "SW". */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "ME";
  const a = w[0][0] ?? "";
  const b = w.length > 1 ? w[w.length - 1][0] ?? "" : "";
  return (a + b).toUpperCase() || "ME";
}
