import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, paypalClientId, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Who is this visitor? Guest (default) or a PayPal sandbox account.
 * Also reports whether sign-in with PayPal is configured on this deployment.
 */
export async function GET() {
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE)?.value);
  const paypalLoginAvailable = Boolean(paypalClientId() && process.env.PAYPAL_CLIENT_SECRET);
  const body = session
    ? { mode: "paypal" as const, paypal: session.paypal, paypalLoginAvailable }
    : { mode: "guest" as const, paypalLoginAvailable };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
