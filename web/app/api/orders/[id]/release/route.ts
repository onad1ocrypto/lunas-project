import { fail, json } from "@/lib/server/http";
import { autoReleaseIfDue, releaseEscrow } from "@/lib/server/flow";
import { hydrateFromTicket } from "@/lib/server/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders/:id/release
 *
 * The "LUNAS" moment. Payouts v1 pays the freelancer out of escrow.
 * `actor: "client"` = the client pressed Approve; without an actor the release policy
 * checks the review window and either auto-releases or reports how long is left.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await hydrateFromTicket(req);
    const body = (await req.json().catch(() => ({}))) as { actor?: "client" | "auto" | "mediator"; force?: boolean };

    if (body.force || body.actor === "client" || body.actor === "mediator") {
      const res = await releaseEscrow(id, body.actor === "mediator" ? "mediator" : "client_approved");
      return json({ ok: true, released: true, alreadyPaid: res.alreadyPaid, payoutBatchId: res.batchId, order: res.order });
    }

    const check = await autoReleaseIfDue(id);
    return json({ ok: true, ...check });
  } catch (e) {
    return fail(e);
  }
}
