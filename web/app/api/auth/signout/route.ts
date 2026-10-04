import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Sign out: drop the session cookie. The visitor falls back to guest mode. */
export async function POST() {
  const res = NextResponse.json({ ok: true, mode: "guest" as const }, { headers: { "cache-control": "no-store" } });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
