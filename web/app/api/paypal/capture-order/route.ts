import { NextResponse } from "next/server";
import { capturePayPalOrder, paypalEnabled } from "@/lib/paypal";
import { pushCall } from "@/lib/webhook";

export async function POST(req: Request) {
  if (!paypalEnabled()) return NextResponse.json({ enabled: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { paypalOrderId?: string };
  if (!b.paypalOrderId) return NextResponse.json({ error: "missing paypalOrderId" }, { status: 400 });
  try {
    const r = await capturePayPalOrder(b.paypalOrderId);
    pushCall({ at: new Date().toISOString(), op: "orders.capture", detail: `${r.status} · capture ${r.captureId ?? "-"}`, ok: r.status === "COMPLETED", ref: b.paypalOrderId });
    return NextResponse.json({ enabled: true, ...r });
  } catch (e) {
    pushCall({ at: new Date().toISOString(), op: "orders.capture", detail: String(e).slice(0, 80), ok: false, ref: b.paypalOrderId });
    return NextResponse.json({ enabled: true, error: String(e) }, { status: 502 });
  }
}
