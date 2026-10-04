import { NextResponse } from "next/server";
import { createPayout, paypalEnabled } from "@/lib/paypal";
import { pushCall } from "@/lib/webhook";

export async function POST(req: Request) {
  if (!paypalEnabled()) return NextResponse.json({ enabled: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { orderId?: string; amount?: number; currency?: string; receiver?: string; note?: string };
  if (!b.orderId || typeof b.amount !== "number" || !b.receiver) return NextResponse.json({ error: "bad payload" }, { status: 400 });
  try {
    const r = await createPayout({ id: b.orderId, amount: b.amount, currency: b.currency || "USD", receiver: b.receiver, note: b.note || "Lunas release" });
    pushCall({ at: new Date().toISOString(), op: "payouts.create", detail: `${b.orderId} · batch ${r.batchId ?? "-"} ${r.status ?? ""}`, ok: Boolean(r.batchId), ref: b.orderId });
    return NextResponse.json({ enabled: true, ...r });
  } catch (e) {
    pushCall({ at: new Date().toISOString(), op: "payouts.create", detail: String(e).slice(0, 80), ok: false, ref: b.orderId });
    return NextResponse.json({ enabled: true, error: String(e) }, { status: 502 });
  }
}
