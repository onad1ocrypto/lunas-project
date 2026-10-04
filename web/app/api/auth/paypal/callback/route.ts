import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  appOrigin,
  callbackUrl,
  exchangeCode,
  fetchUserInfo,
  paypalClientId,
  paypalSecret,
  signSession,
  verifyState,
} from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Step 2 of "Log in with PayPal": PayPal returns ?code=…. We exchange it for an
 * access token, read the OpenID Connect userinfo, and store the identity in a
 * signed HttpOnly cookie. No PayPal password is involved at any point.
 */
export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const back = (error: string) => NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(error)}`);

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");

  // user cancelled on PayPal's side, or the feature is not enabled for this app
  const declined = params.get("error");
  if (declined) return back(declined === "access_denied" ? "cancelled" : declined);
  if (!code) return back("no_code");
  if (!verifyState(state)) return back("bad_state");
  if (!paypalClientId() || !paypalSecret()) return back("paypal_not_configured");

  try {
    const accessToken = await exchangeCode(code, callbackUrl(req));
    const identity = await fetchUserInfo(accessToken);
    const res = NextResponse.redirect(`${origin}/profile?welcome=1`);
    res.cookies.set({
      name: SESSION_COOKIE,
      value: signSession(identity),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    res.cookies.set({ name: "lunas_oauth_from", value: "", path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "paypal_error";
    // never echo tokens; a short reason is enough for the sign-in page
    return back(msg.slice(0, 60).replace(/[^a-zA-Z0-9 _.:-]/g, ""));
  }
}
