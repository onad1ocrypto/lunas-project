import { fail, json } from "@/lib/server/http";
import { refundEscrow } from "@/lib/server/flow";
import { hydrateFromTicket } from "@/lib/server/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders/:id/refund   { reason, amount? }
 *
 * Mediator Agent outcome: the client's money goes back via the Payments v1 refund API.
 * In the demo this backs the dispute branch — a failed verification plus a client veto
 * resolves to a refund instead of a payout.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await hydrateFromTicket(req);
    const body = (await req.json().catch(() => ({}))) as { reason?: string; amount?: number };
    const reason = (body.reason ?? "delivery did not meet the agreed criteria").slice(0, 200);
    const res = await refundEscrow(id, reason, typeof body.amount === "number" && body.amount > 0 ? body.amount : undefined);
    return json({ ok: true, refund: res.refund, order: res.order });
  } catch (e) {
    return fail(e);
  }
}
