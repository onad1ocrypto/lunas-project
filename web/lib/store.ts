/* =========================================================
   Supabase persistence for public profiles (server-only).

   The browser keeps its own copy; this is what makes a profile visible to
   *other people*: /to/<handle> reads from here, so a client on any device
   sees the real photo, links and portfolio.

   Access uses the Supabase **secret** key, which bypasses row level
   security — it must never reach the browser. The table has RLS on with no
   policies, so this route is the only door.
   ========================================================= */

import { ME_PROFILE_FALLBACK, type MeProfile } from "./profile";

const url = () =>
  (process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "");

const key = () => (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();

export const storeEnabled = () => Boolean(url() && key());

/** Columns that are safe to show to strangers. Never payer_id, never email. */
const PUBLIC_COLUMNS = "name,handle,city,country,bio,tags,photo,socials,portfolio";

async function sb(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${url()}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** What a visitor sees on /to/<handle>. Null when nobody published that handle. */
export async function getPublishedProfile(handle: string): Promise<MeProfile | null> {
  if (!storeEnabled() || !handle) return null;
  const r = await sb(`profiles?handle=eq.${encodeURIComponent(handle)}&select=${PUBLIC_COLUMNS}&limit=1`);
  if (!r.ok) return null;
  const rows = (await r.json()) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0] as MeProfile;
}

export interface MyPublication {
  published: boolean;
  handle?: string;
  updatedAt?: string;
}

/** Has this PayPal account published a profile, and under which handle? */
export async function getMyPublication(payerId: string): Promise<MyPublication> {
  if (!storeEnabled() || !payerId) return { published: false };
  const r = await sb(`profiles?payer_id=eq.${encodeURIComponent(payerId)}&select=handle,updated_at&limit=1`);
  if (!r.ok) return { published: false };
  const rows = (await r.json()) as { handle?: string; updated_at?: string }[];
  if (!Array.isArray(rows) || rows.length === 0) return { published: false };
  return { published: true, handle: rows[0].handle, updatedAt: rows[0].updated_at };
}

export type PublishResult =
  | { ok: true; handle: string }
  | { ok: false; error: "handle_taken" | "table_missing" | "failed"; detail?: string };

/** Insert or update the profile owned by this PayPal account id. */
export async function publishProfile(payerId: string, profile: MeProfile): Promise<PublishResult> {
  if (!storeEnabled()) return { ok: false, error: "failed", detail: "store not configured" };

  const body = {
    payer_id: payerId,
    name: profile.name,
    handle: profile.handle,
    city: profile.city,
    country: profile.country,
    bio: profile.bio,
    tags: profile.tags,
    photo: profile.photo ?? null,
    socials: profile.socials ?? {},
    portfolio: profile.portfolio ?? [],
    updated_at: new Date().toISOString(),
  };

  const r = await sb(`profiles?on_conflict=payer_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });

  if (r.ok) return { ok: true, handle: profile.handle };

  const text = await r.text().catch(() => "");
  /* 23505 = unique violation on handle: someone else already owns that page */
  if (r.status === 409 || text.includes("23505") || text.includes("duplicate key")) {
    return { ok: false, error: "handle_taken" };
  }
  /* PGRST205 = the table is not there yet: one SQL statement fixes setup. */
  if (text.includes("PGRST205") || text.includes("Could not find the table")) {
    return { ok: false, error: "table_missing" };
  }
  return { ok: false, error: "failed", detail: text.slice(0, 200) };
}

export { ME_PROFILE_FALLBACK };
