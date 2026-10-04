import { NextResponse } from "next/server";
import { paypalEnabled, refundCapture } from "@/lib/paypal";
import { pushCall } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refunds — called only after the Mediator Agent rules for the client.
 * Body: { captureId, orderId, amount?, currency?, reason?, note? }
 * Full refund when amount is omitted (PayPal refunds the whole capture).
 */
export async function POST(req: Request) {
  if (!paypalEnabled()) return NextResponse.json({ enabled: false, error: "PayPal not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as {
    captureId?: string; orderId?: string; amount?: number; currency?: string; reason?: string; note?: string;
  };
  if (!b.captureId || !/^[\w-]{6,40}$/.test(b.captureId))
    return NextResponse.json({ enabled: true, error: "missing/invalid captureId" }, { status: 400 });
  try {
    const r = await refundCapture(b.captureId, {
      id: b.orderId || b.captureId,
      amount: typeof b.amount === "number" ? b.amount : undefined,
      currency: b.currency || "USD",
      reason: b.reason,
      note: b.note || `Lunas mediator decision: ${b.reason || "refund"}`,
    });
    pushCall({ at: new Date().toISOString(), op: "captures.refund", detail: `${r.status} · refund ${r.refundId}`, ok: true, ref: b.captureId });
    return NextResponse.json({ enabled: true, ...r });
  } catch (e) {
    pushCall({ at: new Date().toISOString(), op: "captures.refund", detail: String(e instanceof Error ? e.message : e).slice(0, 80), ok: false, ref: b.captureId });
    return NextResponse.json({ enabled: true, error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
