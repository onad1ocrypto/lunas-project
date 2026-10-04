import { startEscrow } from "@/lib/server/flow";
import { fail, json, originOf, rateLimit } from "@/lib/server/http";
import { paypalMode } from "@/lib/server/paypal";
import { hydrateFromTicket } from "@/lib/server/resolve";
import { grossOf } from "@/lib/server/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/paypal/orders   { orderId }
 *
 * Orders v2 — creates the payment the client approves. The captured money is the escrow
 * hold: it sits in the platform balance until the Verification Agent (and the client
 * review window) clear it.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { orderId?: string };
    if (!body.orderId) return json({ ok: false, error: "orderId is required" }, 400);
    await hydrateFromTicket(req);
    if (!rateLimit(`pay-create:${body.orderId}`, 20)) return json({ ok: false, error: "Too many attempts" }, 429);

    const origin = originOf(req);
    const res = await startEscrow(body.orderId, origin);
    if (!res.order) return json({ ok: false, error: `Order ${body.orderId} not found` }, 404);

    return json({
      ok: true,
      mode: res.mode,
      reused: res.reused,
      orderId: body.orderId,
      paypalOrderId: res.paypalOrderId,
      approvalUrl: res.approvalUrl,
      amount: grossOf(res.order),
      currency: res.order.currency,
      status: res.order.status,
      simulated: res.mode === "simulated",
      next: `POST /api/paypal/orders/${res.paypalOrderId}/capture`,
    });
  } catch (e) {
    return fail(e);
  }
}

/** GET /api/paypal/orders — quick look at the current mode, useful for debugging. */
export async function GET() {
  return json({ ok: true, mode: paypalMode(), hint: "POST { orderId } to create an escrow payment." });
}
