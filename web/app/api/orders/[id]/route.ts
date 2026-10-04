import { updateOrder } from "@/lib/server/store";
import { resolveOrder } from "@/lib/server/resolve";
import { withTicket } from "@/lib/server/ticket";
import { fail, json } from "@/lib/server/http";
import { autoReleaseIfDue } from "@/lib/server/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/orders/:id — full escrow record including the agent audit trail. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const order = await resolveOrder(id, _req);
    if (!order) return json({ ok: false, error: `Order ${id} not found` }, 404);
    return json({ ok: true, order });
  } catch (e) {
    return fail(e);
  }
}

/**
 * PATCH /api/orders/:id — freelancer actions that are not money movements:
 * accept / decline a request. Anything touching money goes through the PayPal routes.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const order = await resolveOrder(id, req);
    if (!order) return json({ ok: false, error: `Order ${id} not found` }, 404);

    if (body.action === "accept") {
      if (order.status !== "request") return json({ ok: false, error: `Order is ${order.status}` }, 409);
      const updated = await updateOrder(id, { status: "awaiting_payment", events: [...order.events, { at: new Date().toISOString(), who: "contract", msg: "accepted by freelancer", res: "payment link sent to client", kind: "hook" }] });
      return json(withTicket({ ok: true, order: updated }));
    }
    if (body.action === "decline") {
      const updated = await updateOrder(id, { status: "declined", events: [...order.events, { at: new Date().toISOString(), who: "contract", msg: "declined", kind: "err" }] });
      return json(withTicket({ ok: true, order: updated }));
    }
    if (body.action === "auto_release_check") {
      return json({ ok: true, ...(await autoReleaseIfDue(id)) });
    }
    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (e) {
    return fail(e);
  }
}
