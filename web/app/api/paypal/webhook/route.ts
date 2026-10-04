import { NextResponse } from "next/server";
import { paypalEnabled, verifyWebhookSignature, webhookIdConfigured } from "@/lib/paypal";
import { actionFor, pushEvent, recentCalls, recentEvents, type HookEvent } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PPEvent = {
  id?: string;
  event_type?: string;
  resource_version?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    reference_id?: string;
    amount?: { value?: string; currency_code?: string; currency?: string };
    payer?: { email_address?: string };
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  };
};

/**
 * PayPal webhook receiver.
 *
 * Security: when PAYPAL_WEBHOOK_ID is configured every delivery is checked
 * against PayPal's own signature service (POST /v1/notifications/
 * verify-webhook-signature). Unverified deliveries are rejected with 400 and
 * never touch the state machine. Without the env var the endpoint stays in
 * documented demo mode (accepted, flagged verified:false) so local dev works.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const h = req.headers;
  const event = (() => {
    try { return JSON.parse(raw) as PPEvent; } catch { return {} as PPEvent; }
  })();

  const chk = await verifyWebhookSignature(
    {
      authAlgo: h.get("paypal-auth-algo") ?? undefined,
      certUrl: h.get("paypal-cert-url") ?? undefined,
      transmissionId: h.get("paypal-transmission-id") ?? undefined,
      transmissionSig: h.get("paypal-transmission-sig") ?? undefined,
      transmissionTime: h.get("paypal-transmission-time") ?? undefined,
    },
    raw
  );

  const type = event.event_type ?? "UNKNOWN";
  const amt = event.resource?.amount;
  const rec: HookEvent = {
    at: new Date().toISOString(),
    id: event.id ?? `local-${Date.now()}`,
    type,
    verified: chk.verified,
    verification: chk.status,
    resource: event.resource?.id ?? event.resource?.batch_header?.payout_batch_id ?? "",
    status: event.resource?.status ?? event.resource?.batch_header?.batch_status ?? "",
    amount: amt?.value ? `${amt.value} ${amt.currency_code ?? amt.currency ?? ""}`.trim() : undefined,
    orderId: event.resource?.custom_id ?? event.resource?.reference_id ?? undefined,
  };

  console.log(
    `[paypal-webhook] ${type} verified=${chk.verified} (${chk.status})` +
    `${rec.orderId ? ` order=${rec.orderId}` : ""}${rec.resource ? ` res=${rec.resource}` : ""}` +
    `${rec.status ? ` status=${rec.status}` : ""} → ${actionFor(type)}`
  );

  // Hard gate: a configured webhook id means we only trust signed deliveries.
  if (webhookIdConfigured() && !chk.verified) {
    return NextResponse.json({ received: false, error: "signature verification failed", status: chk.status, detail: chk.detail }, { status: 400 });
  }

  pushEvent(rec);
  return NextResponse.json({
    received: true,
    verified: chk.verified,
    verification: chk.status,
    type,
    action: actionFor(type),
    paypalEnabled: paypalEnabled(),
  });
}

/** Demo/ops read-out: last verified pushes + config state. */
export async function GET() {
  return NextResponse.json({
    paypalEnabled: paypalEnabled(),
    webhookIdConfigured: webhookIdConfigured(),
    count: recentEvents().length,
    events: recentEvents().map((e) => ({ ...e, action: actionFor(e.type) })),
    apiCalls: recentCalls(),
  });
}
