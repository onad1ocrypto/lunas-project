import { NextResponse } from "next/server";
import { createPayPalOrder, paypalEnabled } from "@/lib/paypal";
import { pushCall } from "@/lib/webhook";

export async function POST(req: Request) {
  if (!paypalEnabled()) return NextResponse.json({ enabled: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { orderId?: string; amount?: number; currency?: string; description?: string; nonce?: number };
  if (!b.orderId || typeof b.amount !== "number") return NextResponse.json({ error: "bad payload" }, { status: 400 });
  try {
    // a fresh nonce per click => the same Lunas order can be funded repeatedly
    // (judges/demos), while a double-click inside one checkout stays idempotent
    const key = b.nonce ? `${b.orderId}-create-${b.nonce}` : `${b.orderId}-create`;
    const paypalOrderId = await createPayPalOrder({ id: b.orderId, amount: b.amount, currency: b.currency || "USD", description: b.description || "Lunas escrow" }, key);
    pushCall({ at: new Date().toISOString(), op: "orders.create", detail: `${b.orderId} · ${b.amount} ${b.currency || "USD"}`, ok: true, ref: paypalOrderId });
    return NextResponse.json({ enabled: true, paypalOrderId });
  } catch (e) {
    pushCall({ at: new Date().toISOString(), op: "orders.create", detail: `${b.orderId} · ${String(e).slice(0, 80)}`, ok: false });
    return NextResponse.json({ enabled: true, error: String(e) }, { status: 502 });
  }
}
