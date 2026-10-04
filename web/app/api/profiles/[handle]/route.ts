import { NextResponse } from "next/server";
import { getPublishedProfile, storeEnabled } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Public read of a published profile — this is what /to/<handle> shows to visitors
 * on any device. Only the fields a client should see are returned (no account id,
 * no email, nothing else from the row).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!storeEnabled()) return NextResponse.json({ profile: null, store: false });
  const profile = await getPublishedProfile(handle);
  return NextResponse.json({ profile, store: true }, { headers: { "cache-control": "no-store" } });
}
