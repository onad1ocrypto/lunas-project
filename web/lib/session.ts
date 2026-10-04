/* =========================================================
   Server-side sessions for "Log in with PayPal" (sandbox).

   The whole session lives in one signed, HttpOnly cookie:
     - no database needed (works on cold serverless instances)
     - no PayPal password is ever seen, stored or logged by us
     - the only PayPal data kept is what the Identity API returns:
       account id (payer id), name, email, country

   Signing key order: AUTH_SECRET -> PAYPAL_CLIENT_SECRET -> dev fallback.
   Set AUTH_SECRET in production to keep the two keys separate.
   ========================================================= */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "lunas_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const STATE_MAX_AGE_MS = 15 * 60 * 1000; // an authorization round trip must finish in 15 min

export interface PayPalIdentity {
  payerId: string; // PayPal account id — also a valid Payouts receiver
  email: string;
  name: string;
  country?: string;
}

export interface SessionPayload {
  mode: "paypal";
  paypal: PayPalIdentity;
  iat: number;
}

interface StatePayload {
  kind: "oauth-state";
  n: string;
  iat: number;
}

const secret = () =>
  process.env.AUTH_SECRET || process.env.PAYPAL_CLIENT_SECRET || "lunas-dev-secret";

const sign = (body: string) =>
  createHmac("sha256", secret()).update(body).digest("base64url");

function verifySignature(token: string | undefined): unknown | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function signSession(paypal: PayPalIdentity): string {
  const payload: SessionPayload = { mode: "paypal", paypal, iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySession(token: string | undefined): SessionPayload | null {
  const p = verifySignature(token) as SessionPayload | null;
  if (!p || p.mode !== "paypal" || !p.paypal?.payerId) return null;
  return p;
}

/** Signed, single-use-ish OAuth state: binds the callback to a flow we started. */
export function signState(): string {
  const payload: StatePayload = { kind: "oauth-state", n: randomUUID(), iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyState(token: string | null): boolean {
  const p = verifySignature(token ?? undefined) as StatePayload | null;
  if (!p || p.kind !== "oauth-state" || typeof p.iat !== "number") return false;
  return Date.now() - p.iat < STATE_MAX_AGE_MS;
}

/* ---------- endpoints & URLs ---------- */

const live = () => process.env.PAYPAL_LIVE === "1";

export const paypalApiBase = () =>
  live() ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export const paypalWebBase = () =>
  live() ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";

export const paypalClientId = () =>
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || "";

export const paypalSecret = () => process.env.PAYPAL_CLIENT_SECRET || "";

/**
 * Public origin of this deployment. APP_ORIGIN wins so the OAuth return URL
 * matches exactly what is registered in the Developer Dashboard even behind proxies.
 */
export function appOrigin(req: NextRequest): string {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  if (proto && host) return `${proto}://${host}`;
  return req.nextUrl.origin;
}

export const callbackUrl = (req: NextRequest) => `${appOrigin(req)}/api/auth/paypal/callback`;

/** The "Log in with PayPal" authorization endpoint (sandbox by default). */
export function authorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    flowEntry: "static",
    client_id: paypalClientId(),
    response_type: "code",
    scope: "openid profile email address https://uri.paypal.com/services/paypalattributes",
    redirect_uri: redirectUri,
    state,
  });
  return `${paypalWebBase()}/connect?${q.toString()}`;
}

/** Authorization code -> access token (Basic auth with the app's client id/secret). */
export async function exchangeCode(code: string, redirectUri: string) {
  const auth = Buffer.from(`${paypalClientId()}:${paypalSecret()}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const r = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const j = (await r.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || `token exchange failed (${r.status})`);
  }
  return j.access_token;
}

/** Identity API — OpenID Connect standard claims for the user who just consented. */
export async function fetchUserInfo(accessToken: string): Promise<PayPalIdentity> {
  const r = await fetch(`${paypalApiBase()}/v1/identity/oauth2/userinfo?schema=openid`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const j = (await r.json()) as {
    user_id?: string;
    payer_id?: string;
    email?: string;
    name?: string;
    address?: { country?: string };
    locale?: string;
    error_description?: string;
  };
  if (!r.ok) throw new Error(j.error_description || `userinfo failed (${r.status})`);
  const payerId = j.user_id || j.payer_id;
  if (!payerId) throw new Error("userinfo did not return a PayPal account id");
  return {
    payerId,
    email: j.email || "",
    name: (j.name || "").trim() || j.email?.split("@")[0] || "PayPal user",
    country: j.address?.country,
  };
}
