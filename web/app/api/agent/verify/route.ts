import { NextResponse } from "next/server";
import { verifyDelivery } from "@/lib/agent";
import type { Criterion } from "@/lib/data";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { criteria?: Criterion[]; attempt?: number };
  const criteria = Array.isArray(b.criteria) ? b.criteria.slice(0, 8) : [];
  if (!criteria.length) return NextResponse.json({ error: "no criteria" }, { status: 400 });
  const r = await verifyDelivery(criteria, Number(b.attempt ?? 1));
  return NextResponse.json(r);
}
