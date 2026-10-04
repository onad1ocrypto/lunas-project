import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ME_PROFILE_FALLBACK, sanitizeProfile } from "@/lib/profile";
import { getMyPublication, publishProfile, storeEnabled } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Is my profile published, and under which handle? (Requires a PayPal session.) */
export async function GET() {
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ published: false, signedIn: false, store: storeEnabled() });
  const publication = await getMyPublication(session.paypal.payerId);
  return NextResponse.json({ ...publication, signedIn: true, store: storeEnabled() }, { headers: { "cache-control": "no-store" } });
}

/**
 * Publish the signed-in user's profile so other people (clients) can see the real
 * photo, links and portfolio on /to/<handle>.
 *
 * The profile object is sanitised again here — the browser is not trusted with hrefs,
 * photo sizes or handles.
 */
export async function PUT(req: NextRequest) {
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ ok: false, error: "sign_in_required" }, { status: 401 });
  }
  if (!storeEnabled()) {
    return NextResponse.json({ ok: false, error: "store_not_ready" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const fallback = {
    ...ME_PROFILE_FALLBACK,
    name: session.paypal.name || ME_PROFILE_FALLBACK.name,
    handle: (session.paypal.email.split("@")[0] || "me").toLowerCase().slice(0, 32),
    city: "",
    bio: "",
    tags: [],
  };
  const profile = sanitizeProfile(body, fallback);

  const result = await publishProfile(session.paypal.payerId, profile);
  if (!result.ok) {
    const status = result.error === "handle_taken" ? 409 : result.error === "table_missing" ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.error, detail: result.detail }, { status });
  }
  return NextResponse.json({ ok: true, handle: result.handle, url: `/to/${result.handle}` }, { headers: { "cache-control": "no-store" } });
}
