import { captureEscrow } from "@/lib/server/flow";
import { fail, json, rateLimit } from "@/lib/server/http";
import { getOrderById } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/paypal/orders/:paypalOrderId/capture
 *
 * Captures an approved payment into escrow. The body may carry `lunasOrderId` (the LNS-…
 * id) — that is how the public checkout page comes back from PayPal.
 */
export async function POST(req: Request, ctx: { params: Promise<{ paypalOrderId: string }> }) {
  try {
    const { paypalOrderId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { lunasOrderId?: string };

    let lunasOrderId = body.lunasOrderId;
    if (!lunasOrderId) {
      // Resolve LNS-… from the PayPal order id so the endpoint also works from a webhook-style call.
      const { listOrders } = await import("@/lib/server/store");
      const all = await listOrders();
      lunasOrderId = all.find((o) => o.paypal.orderId === paypalOrderId)?.id;
    }
    if (!lunasOrderId) return json({ ok: false, error: "Unknown PayPal order — pass lunasOrderId in the body." }, 404);
    if (!rateLimit(`capture:${lunasOrderId}`, 20)) return json({ ok: false, error: "Too many attempts" }, 429);

    const res = await captureEscrow(lunasOrderId, paypalOrderId);
    const order = res.order ?? (await getOrderById(lunasOrderId));
    return json({
      ok: true,
      alreadyCaptured: res.alreadyCaptured,
      captureId: res.captureId,
      status: order?.status,
      paypal: order?.paypal,
      next: "POST /api/orders/:id/deliverables once the work is done",
    });
  } catch (e) {
    return fail(e);
  }
}
