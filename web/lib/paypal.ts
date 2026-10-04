/* =========================================================
   PayPal REST client (server-side only).
   Sandbox by default; set PAYPAL_LIVE=1 for production.
   Activated when PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET exist.
   ========================================================= */

export const paypalEnabled = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const BASE = () =>
  process.env.PAYPAL_LIVE === "1" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

let cache: { tok: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (cache && cache.exp > Date.now()) return cache.tok;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${BASE()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`PayPal auth failed (${r.status})`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cache = { tok: j.access_token, exp: Date.now() + (j.expires_in - 90) * 1000 };
  return cache.tok;
}

/** Escrow step 1 — client pays into the platform order (funds held until release). */
export async function createPayPalOrder(ref: { id: string; amount: number; currency: string; description: string }, idempotencyKey?: string) {
  const t = await token();
  const r = await fetch(`${BASE()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": idempotencyKey || `${ref.id}-create`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: ref.id,
          custom_id: ref.id,
          soft_descriptor: "LUNAS ESCROW",
          description: ref.description.slice(0, 120),
          amount: { currency_code: ref.currency, value: ref.amount.toFixed(2) },
        },
      ],
    }),
    cache: "no-store",
  });
  const j = (await r.json()) as { id?: string; message?: string };
  if (!r.ok || !j.id) throw new Error(j.message ?? `orders.create failed (${r.status})`);
  return j.id;
}

/** Escrow step 2 — capture on client approval (sandbox: money moves to sandbox merchant). */
export async function capturePayPalOrder(paypalOrderId: string) {
  const t = await token();
  const r = await fetch(`${BASE()}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", "PayPal-Request-Id": `${paypalOrderId}-capture` },
    cache: "no-store",
  });
  const j = (await r.json()) as { status?: string; message?: string; purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[] };
  if (!r.ok) throw new Error(j.message ?? `orders.capture failed (${r.status})`);
  const cap = j.purchase_units?.[0]?.payments?.captures?.[0];
  return { status: j.status ?? "UNKNOWN", captureId: cap?.id, captureStatus: cap?.status };
}

/** Release — pay the freelancer via Payouts (sandbox enablement required on the app). */
export async function createPayout(ref: { id: string; amount: number; currency: string; receiver: string; note: string }) {
  const t = await token();
  const r = await fetch(`${BASE()}/v1/payments/payouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", "PayPal-Partner-Attribution-Id": "lunas-hackathon" },
    body: JSON.stringify({
      sender_batch_header: { sender_batch_id: `${ref.id}-payout-${Date.now()}`, email_subject: "You got paid on Lunas!" },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: ref.receiver,
          amount: { currency: ref.currency, value: ref.amount.toFixed(2) },
          note: ref.note.slice(0, 255),
          sender_item_id: ref.id,
        },
      ],
    }),
    cache: "no-store",
  });
  const j = (await r.json()) as { batch_header?: { payout_batch_id: string; batch_status: string }; message?: string };
  if (!r.ok) throw new Error(j.message ?? `payouts.create failed (${r.status})`);
  return { batchId: j.batch_header?.payout_batch_id, status: j.batch_header?.batch_status };
}

/* ---------------------------------------------------------
   Webhooks — verify that a PUSH really came from PayPal.
   Requires PAYPAL_WEBHOOK_ID (from Apps & Credentials →
   Webhooks). Without it the receiver stays in demo mode.
   --------------------------------------------------------- */
export interface WebhookHeaders {
  authAlgo?: string;
  certUrl?: string;
  transmissionId?: string;
  transmissionSig?: string;
  transmissionTime?: string;
}

export const webhookIdConfigured = () => Boolean(process.env.PAYPAL_WEBHOOK_ID);

export async function verifyWebhookSignature(h: WebhookHeaders, rawBody: string): Promise<{ verified: boolean; status: string; detail?: string }> {
  const wid = process.env.PAYPAL_WEBHOOK_ID;
  if (!wid) return { verified: false, status: "WEBHOOK_ID_NOT_CONFIGURED" };
  if (!h.transmissionId || !h.transmissionSig || !h.certUrl || !h.transmissionTime)
    return { verified: false, status: "MISSING_HEADERS" };
  const t = await token();
  const r = await fetch(`${BASE()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: h.authAlgo,
      cert_url: h.certUrl,
      transmission_id: h.transmissionId,
      transmission_sig: h.transmissionSig,
      transmission_time: h.transmissionTime,
      webhook_id: wid,
      webhook_event: JSON.parse(rawBody),
    }),
    cache: "no-store",
  });
  const j = (await r.json()) as { verification_status?: string; message?: string };
  if (!r.ok) return { verified: false, status: `VERIFY_HTTP_${r.status}`, detail: j.message };
  return { verified: j.verification_status === "SUCCESS", status: j.verification_status ?? "UNKNOWN" };
}

/* ---------------------------------------------------------
   Refunds — money back to the client when the Mediator
   Agent rules in their favour (full or partial).
   --------------------------------------------------------- */
export async function refundCapture(captureId: string, ref: {
  id: string; amount?: number; currency?: string; reason?: string; note?: string;
}) {
  const t = await token();
  const body: Record<string, unknown> = {
    note_to_payer: (ref.note || "Lunas mediator refund").slice(0, 255),
  };
  if (typeof ref.amount === "number" && ref.amount > 0)
    body.amount = { value: ref.amount.toFixed(2), currency_code: ref.currency || "USD" };
  const r = await fetch(`${BASE()}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `${ref.id}-refund-${Date.now()}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = (await r.json()) as { id?: string; status?: string; message?: string; details?: { issue?: string; description?: string }[] };
  if (!r.ok || !j.id) throw new Error(j.details?.[0]?.description || j.message || `captures.refund failed (${r.status})`);
  return { refundId: j.id, status: j.status ?? "UNKNOWN" };
}
