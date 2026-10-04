/* =========================================================
   Pure profile helpers — shared by the browser (lib/me.tsx) and the
   server (API routes). No React, no DOM: safe to import anywhere.
   ========================================================= */

export interface MeSocials {
  x?: string;
  linkedin?: string;
  instagram?: string;
  website?: string;
}

export interface MePortfolioItem {
  label: string;
  url: string;
}

export interface MeProfile {
  name: string;
  handle: string;
  city: string;
  country: string;
  bio: string;
  tags: string[];
  /** Avatar as a data URL (already downscaled in the browser). */
  photo?: string;
  socials?: MeSocials;
  portfolio?: MePortfolioItem[];
}

export const MAX_PORTFOLIO = 6;
export const SOCIAL_KEYS = ["x", "linkedin", "instagram", "website"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

/* ---------- masking for screen recordings ----------
   The signed-in screen shows which PayPal sandbox account is connected. That is useful
   for the owner but should not end up in a demo video, so it is masked until revealed. */

/** Keep the domain, hide the local part: "sb-1234x@personal.example.com" -> "s••••••@personal.example.com" */
export function maskEmail(email: string): string {
  const s = (email || "").trim();
  const at = s.indexOf("@");
  if (at <= 0) return s ? "•••" : "";
  const local = s.slice(0, at);
  return `${local.slice(0, 1)}${"•".repeat(Math.min(12, Math.max(4, local.length - 1)))}${s.slice(at)}`;
}

/** Show only the tail of an account id: a long PayPal user id -> "…XyE4PXS9" */
export function maskId(id: string): string {
  const alnum = (id || "").replace(/[^A-Za-z0-9]/g, "");
  return alnum.length > 4 ? `…${alnum.slice(-8)}` : "•••";
}

/** Only http(s) links ever reach an href; a bare "x.com/me" gets https:// prefixed. */
export function normalizeUrl(raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname.includes(".")) return "";
    return u.toString();
  } catch {
    return "";
  }
}

/**
 * Country code -> readable name in the reader's language ("ID" -> "Indonesia"),
 * used when a profile has no city. Falls back to the code itself.
 */
export function countryName(code: string, locale = "en"): string {
  const c = (code || "").trim().toUpperCase();
  if (!c) return "";
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    return dn.of(c) || c;
  } catch {
    return c;
  }
}

/** "Wonogiri" or, without a city, "Indonesia" — never an empty line. */
export function locationOf(p: { city?: string; country?: string }, locale = "en"): string {
  const city = (p.city || "").trim();
  if (city) return city;
  return countryName(p.country || "", locale);
}

/** Human-readable host, used on portfolio cards and link chips. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function cleanHandle(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/** Coerce anything (user input, storage, API body) into a safe MeProfile. */
export function sanitizeProfile(input: unknown, fallback: MeProfile): MeProfile {
  const p = (input ?? {}) as Partial<MeProfile>;
  if (typeof p !== "object") return fallback;

  const photo =
    typeof p.photo === "string" && p.photo.startsWith("data:image/") && p.photo.length < 2_000_000
      ? p.photo
      : undefined;

  const socials: MeSocials = {};
  for (const k of SOCIAL_KEYS) {
    const raw = p.socials && typeof p.socials[k] === "string" ? (p.socials[k] as string) : "";
    const v = normalizeUrl(raw);
    if (v) socials[k] = v;
  }

  const portfolio = Array.isArray(p.portfolio)
    ? p.portfolio
        .filter((it): it is MePortfolioItem => !!it && typeof it.url === "string")
        .map((it) => ({ label: String(it.label ?? "").trim().slice(0, 60), url: normalizeUrl(it.url) }))
        .filter((it) => it.url)
        .slice(0, MAX_PORTFOLIO)
    : [];

  return {
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 80) : fallback.name,
    handle: cleanHandle(typeof p.handle === "string" ? p.handle : "") || fallback.handle,
    city: typeof p.city === "string" ? p.city.trim().slice(0, 60) : fallback.city,
    country: (typeof p.country === "string" && p.country ? p.country : fallback.country).toUpperCase().slice(0, 2),
    bio: typeof p.bio === "string" ? p.bio.slice(0, 600) : fallback.bio,
    tags: Array.isArray(p.tags)
      ? p.tags.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 28)).slice(0, 6)
      : fallback.tags,
    photo,
    socials: Object.keys(socials).length ? socials : undefined,
    portfolio: portfolio.length ? portfolio : undefined,
  };
}

/** Guest persona — what every visitor gets without signing in. Editable like any profile. */
export const ME_PROFILE_FALLBACK: MeProfile = {
  name: "SASAM",
  handle: "sasam",
  city: "",
  country: "ID",
  bio: "Product photo editor & designer based in Indonesia. This is the shared demo profile — edit every field, or sign in with a PayPal sandbox account to make the profile your own.",
  tags: ["Photo editing", "Social media design", "Logos", "Etsy & Shopify"],
};
