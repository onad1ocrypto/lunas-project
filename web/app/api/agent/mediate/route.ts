import { NextResponse } from "next/server";
import { mediate } from "@/lib/agent";
import type { Lang } from "@/lib/dict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mediator Agent — disputes/refund rulings.
 * Body: { orderId, claim, criteria:[{label,pass}], attempts?, hoursSinceDelivery?, late?, amount?, lang? }
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    orderId?: string; claim?: string; criteria?: { label?: string; pass?: boolean }[];
    attempts?: number; hoursSinceDelivery?: number; late?: boolean; amount?: number; lang?: string;
  };
  const criteria = Array.isArray(b.criteria)
    ? b.criteria.slice(0, 8).map((c) => ({ label: String(c.label ?? "criterion").slice(0, 90), pass: Boolean(c.pass) }))
    : [];
  const claim = String(b.claim ?? "").slice(0, 1500);
  if (!criteria.length && claim.trim().length < 5)
    return NextResponse.json({ error: "need a claim or criteria to mediate" }, { status: 400 });

  const lang: Lang = b.lang === "zh" || b.lang === "id" ? b.lang : "en";
  const v = await mediate({
    orderId: String(b.orderId ?? "LNS-0000").slice(0, 24),
    claim,
    criteria,
    attempts: Number.isFinite(Number(b.attempts)) ? Number(b.attempts) : 1,
    hoursSinceDelivery: Number.isFinite(Number(b.hoursSinceDelivery)) ? Number(b.hoursSinceDelivery) : 0,
    late: Boolean(b.late),
    amount: Number.isFinite(Number(b.amount)) ? Number(b.amount) : undefined,
    lang,
  });
  return NextResponse.json(v);
}
