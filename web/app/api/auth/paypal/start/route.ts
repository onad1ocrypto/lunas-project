import { NextRequest, NextResponse } from "next/server";
import { appOrigin, authorizeUrl, callbackUrl, paypalClientId, paypalSecret, signState } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Step 1 of "Log in with PayPal": send the visitor to PayPal's consent screen.
 * Requires PAYPAL_CLIENT_ID/NEXT_PUBLIC_PAYPAL_CLIENT_ID (+ secret) and the
 * Return URL registered in the Developer Dashboard.
 */
export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const back = (error: string) => NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(error)}`);

  if (!paypalClientId() || !paypalSecret()) return back("paypal_not_configured");
  if (!paypalClientId().startsWith("AX") && !paypalClientId().startsWith("A")) {
    /* Live-style client ids are not required for the sandbox demo — we still try,
       PayPal shows the real reason on its own consent screen. */
  }

  const state = signState();
  const url = authorizeUrl(callbackUrl(req), state);
  const res = NextResponse.redirect(url);
  /* Remember which origin started the flow so the callback returns to the same host. */
  res.cookies.set({ name: "lunas_oauth_from", value: origin, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 900 });
  return res;
}
