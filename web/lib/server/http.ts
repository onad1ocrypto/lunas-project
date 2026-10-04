import { NextResponse } from "next/server";

export const json = <T,>(data: T, status = 200) => NextResponse.json(data as object, { status });

export function fail(error: unknown) {
  const e = error as { status?: number; message?: string; debugId?: string };
  const status = typeof e?.status === "number" ? e.status : 500;
  return NextResponse.json(
    { ok: false, error: e?.message ?? "Unexpected error", debugId: e?.debugId, mode: "see /api/health" },
    { status },
  );
}

/** Best-effort public origin, so PayPal return URLs point at the real deployment. */
export function originOf(req: Request) {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Tiny in-memory rate limiter: keeps the public endpoints honest during a demo. */
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max = 30, windowMs = 60_000) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || rec.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  rec.n += 1;
  return rec.n <= max;
}
