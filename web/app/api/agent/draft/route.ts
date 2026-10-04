import { NextResponse } from "next/server";
import { draftContract } from "@/lib/agent";
import type { Lang } from "@/lib/dict";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { brief?: string; lang?: string };
  const brief = String(b.brief ?? "");
  const lang: Lang = b.lang === "zh" || b.lang === "id" ? b.lang : "en";
  if (brief.trim().length < 15) return NextResponse.json({ error: "brief too short" }, { status: 400 });
  const r = await draftContract(brief, lang);
  return NextResponse.json(r);
}
