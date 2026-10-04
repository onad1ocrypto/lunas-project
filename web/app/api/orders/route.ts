import { createOrder, listOrders } from "@/lib/server/store";
import { fail, json, originOf, rateLimit } from "@/lib/server/http";
import { draftContract } from "@/lib/server/agents";
import { ME, type Criterion } from "@/lib/data";
import { paypalMode } from "@/lib/server/paypal";
import { compactSnapshot, signTicket } from "@/lib/server/ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/orders — the escrow ledger. */
export async function GET() {
  try {
    const orders = await listOrders();
    return json({
      ok: true,
      count: orders.length,
      mode: paypalMode(),
      orders: orders.map((o) => ({
        id: o.id,
        title: o.title,
        status: o.status,
        amount: o.amount,
        currency: o.currency,
        direction: o.direction,
        client: o.client,
        due: o.due,
        criteria: o.criteria.length,
        paypalOrderId: o.paypal.orderId,
        payoutBatchId: o.paypal.payoutBatchId,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * POST /api/orders
 * Creates a Lunas escrow order. If no criteria are supplied the Contract Agent drafts them
 * from the brief, so the public client form and the wizard share one code path.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`orders:${req.headers.get("x-forwarded-for") ?? "local"}`, 40)) {
      return json({ ok: false, error: "Too many requests" }, 429);
    }
    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      brief?: string;
      amount?: number;
      currency?: string;
      due?: string;
      windowHours?: number;
      direction?: "from_client" | "to_client";
      client?: { name?: string; email?: string; city?: string; country?: string };
      criteria?: Criterion[];
      lang?: "en" | "zh" | "id";
      autoApprove?: boolean;
    };

    const brief = (body.brief ?? "").trim();
    if (brief.length < 10) return json({ ok: false, error: "A brief is required (10+ characters)." }, 400);
    if (!body.client?.name || !body.client?.email) return json({ ok: false, error: "Client name and email are required." }, 400);

    let criteria = Array.isArray(body.criteria) ? body.criteria.filter((c) => c?.label && c?.rule) : [];
    let engine: "llm" | "heuristic" = "heuristic";
    let suggestedAmount = 0;
    let title = (body.title ?? "").trim();

    if (!criteria.length) {
      const draft = await draftContract(brief, { lang: body.lang, currency: body.currency, due: body.due });
      criteria = draft.criteria;
      engine = draft.engine;
      suggestedAmount = draft.amount ?? 0;
      title = title || draft.title;
    }

    const amount = Number(body.amount ?? 0) > 0 ? Number(body.amount) : suggestedAmount;
    if (!(amount > 0)) return json({ ok: false, error: "A positive amount is required (add a budget or a price in the brief)." }, 400);

    const due = body.due && /^\d{4}-\d{2}-\d{2}$/.test(body.due)
      ? body.due
      : new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

    const { order, persisted } = await createOrder({
      direction: body.direction ?? "to_client",
      title: title || "New order",
      brief,
      amount,
      currency: (body.currency ?? "USD").toUpperCase(),
      due,
      windowHours: [24, 48, 72].includes(Number(body.windowHours)) ? Number(body.windowHours) : 72,
      client: {
        name: String(body.client.name).slice(0, 80),
        email: String(body.client.email).slice(0, 120),
        city: body.client.city?.slice(0, 60),
        country: body.client.country?.slice(0, 2)?.toUpperCase(),
      },
      criteria,
      contractEngine: engine,
    });

    const origin = originOf(req);
    /**
     * `ticket` = HMAC-signed snapshot of the order. The browser sends it back on follow-up
     * calls so the flow still works when the host has no durable storage (serverless).
     */
    const ticket = signTicket({ order: compactSnapshot(order) });
    return json(
      {
        ok: true,
        persisted,
        engine,
        ticket,
        order,
        payUrl: `${origin}/pay/${order.id}`,
        freelancer: ME.name,
        mode: paypalMode(),
      },
      201,
    );
  } catch (e) {
    return fail(e);
  }
}
