/**
 * PayPal REST client (Orders v2 + Payments v1 refunds + Payouts v1 + webhook verification).
 *
 * Uses fetch only — no SDK, so the integration is readable end to end.
 * When credentials are missing the same functions return clearly-labelled simulated
 * responses, so the demo flows (and the automated smoke test) never break.
 *
 * Simulation is *never* silent: every payload carries `simulated: true` and the UI shows
 * which mode produced it.
 */

import {
  paypalApiBase,
  paypalClientId,
  paypalClientSecret,
  paypalConfigured,
  paypalMode,
  paypalWebBase,
  paypalWebhookId,
} from "./env";

export interface PayPalResult<T> {
  ok: boolean;
  simulated: boolean;
  status: number;
  data: T;
  error?: string;
  /** Debug id: PayPal's `paypal-debug-id` header, surfaced so failures are diagnosable. */
  debugId?: string;
}

/* ------------------------------------------------------------------ tokens */

let token: { value: string; expiresAt: number } | null = null;

export async function accessToken(): Promise<string> {
  if (!paypalConfigured()) throw new Error("PayPal credentials are not configured");
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;

  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${paypalClientId()}:${paypalClientSecret()}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`PayPal auth failed (${res.status}): ${json.error_description ?? "no access_token"}`);
  }
  token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3000) * 1000 };
  return token.value;
}

async function rest<T>(
  method: "GET" | "POST" | "PATCH",
  route: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<PayPalResult<T>> {
  const bearer = await accessToken();
  const res = await fetch(`${paypalApiBase()}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return {
    ok: res.ok,
    simulated: false,
    status: res.status,
    data,
    error: res.ok ? undefined : describeError(data, res.status),
    debugId: res.headers.get("paypal-debug-id") ?? undefined,
  };
}

function describeError(data: unknown, status: number) {
  const d = data as { message?: string; error_description?: string; name?: string };
  return d?.message ?? d?.error_description ?? d?.name ?? `HTTP ${status}`;
}

/* -------------------------------------------------------------- simulation */

/** PayPal ids look like 5O190127TN364715T — simulate the same shape. */
function simId(prefix = "") {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < 17; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return prefix + out;
}

const sim = <T,>(data: T, status = 200): PayPalResult<T> => ({ ok: true, simulated: true, status, data });

export const isSimulated = () => !paypalConfigured();

/* ------------------------------------------------------------------ orders */

export interface PayPalOrder {
  id: string;
  status: string;
  links?: { href: string; rel: string; method?: string }[];
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: {
      captures?: {
        id: string;
        status: string;
        amount: { currency_code: string; value: string };
        seller_receivable_breakdown?: { gross_amount: { value: string }; paypal_fee: { value: string }; net_amount: { value: string } };
        create_time?: string;
      }[];
    };
  }[];
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
}

export function approvalUrlOf(order: PayPalOrder) {
  return order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href
    ?? order.links?.find((l) => l.rel === "approve")?.href;
}

/**
 * Create an Orders v2 order. `intent: CAPTURE` is used because the money must land in the
 * platform wallet first — that is the escrow hold. It only leaves via a Payouts call, and
 * only after the verification agent + client review say so.
 */
export async function createPayPalOrder(input: {
  referenceId: string;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  brandName?: string;
}) {
  const value = input.amount.toFixed(2);
  if (isSimulated()) {
    const id = simId();
    return sim<PayPalOrder>({
      id,
      status: "CREATED",
      links: [
        { href: `${paypalWebBase()}/checkoutnow?token=${id}`, rel: "approve", method: "GET" },
        { href: `${paypalApiBase()}/v2/checkout/orders/${id}`, rel: "self", method: "GET" },
      ],
      purchase_units: [{ reference_id: input.referenceId, amount: { currency_code: input.currency, value } }],
    }, 201);
  }

  return rest<PayPalOrder>("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.referenceId,
        custom_id: input.referenceId,
        description: input.description.slice(0, 127),
        amount: { currency_code: input.currency, value },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: input.brandName ?? "Lunas",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    },
    application_context: { brand_name: input.brandName ?? "Lunas", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
  });
}

export async function getPayPalOrder(paypalOrderId: string) {
  if (isSimulated()) {
    return sim<PayPalOrder>({ id: paypalOrderId, status: "APPROVED" });
  }
  return rest<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
}

/** Capture = move the client's money into the escrow balance. */
export async function capturePayPalOrder(paypalOrderId: string, referenceId?: string) {
  if (isSimulated()) {
    const id = simId();
    return sim<PayPalOrder>(
      {
        id: paypalOrderId,
        status: "COMPLETED",
        // No seller_receivable_breakdown on purpose: the flow layer fills the real gross
        // amount from the Lunas order rather than the simulator inventing one.
        purchase_units: [
          {
            reference_id: referenceId,
            payments: { captures: [{ id, status: "COMPLETED", amount: { currency_code: "USD", value: "0.00" } }] },
          },
        ],
        payer: { email_address: "payer@example.com" },
      },
      201,
    );
  }
  return rest<PayPalOrder>(
    "POST",
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    undefined,
    { "PayPal-Request-Id": `lunas-capture-${paypalOrderId}` },
  );
}

/* ----------------------------------------------------------------- refunds */

/** Used by the Mediator Agent when a dispute resolves in the client's favour. */
export async function refundCapture(captureId: string, amount?: number, currency = "USD", note = "Lunas mediator refund") {
  if (isSimulated()) {
    return sim({
      id: simId(),
      status: "COMPLETED",
      amount: { currency_code: currency, value: (amount ?? 0).toFixed(2) },
      note_to_payer: note,
    }, 201);
  }
  return rest<{ id: string; status: string }>(
    "POST",
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    {
      ...(amount ? { amount: { value: amount.toFixed(2), currency_code: currency } } : {}),
      note_to_payer: note.slice(0, 255),
    },
    { "PayPal-Request-Id": `lunas-refund-${captureId}-${Date.now()}` },
  );
}

/* ----------------------------------------------------------------- payouts */

/**
 * Release = Payouts v1 batch paying the freelancer. The money only moves here, after the
 * Verification Agent and (optionally) the client review window have both cleared.
 */
export async function createPayout(input: {
  receiver: string;
  amount: number;
  currency: string;
  note: string;
  senderBatchId: string;
}) {
  if (isSimulated()) {
    const batch = simId();
    return sim(
      {
        batch_header: {
          payout_batch_id: batch,
          batch_status: "PENDING",
          sender_batch_header: { sender_batch_id: input.senderBatchId, email_subject: "You've been paid by Lunas" },
        },
        links: [{ href: `${paypalApiBase()}/v1/payments/payouts/${batch}`, rel: "self", method: "GET" }],
      },
      201,
    );
  }
  return rest<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: input.senderBatchId,
        email_subject: "You've been paid — Lunas escrow released",
        email_message: input.note.slice(0, 1000),
        recipient_type: "EMAIL",
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: input.receiver,
          amount: { value: input.amount.toFixed(2), currency: input.currency },
          note: input.note.slice(0, 255),
          purpose: "GOODS",
          sender_item_id: input.senderBatchId,
        },
      ],
    },
    { "PayPal-Request-Id": `lunas-payout-${input.senderBatchId}` },
  );
}

export async function getPayoutBatch(batchId: string) {
  if (isSimulated()) return sim({ batch_header: { payout_batch_id: batchId, batch_status: "SUCCESS" } });
  return rest<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "GET",
    `/v1/payments/payouts/${encodeURIComponent(batchId)}`,
  );
}

/* ---------------------------------------------------------------- webhooks */

/**
 * Verify a webhook signature with PayPal (POST /v1/notifications/verify-webhook-signature)
 * before touching escrow state. Returning "verification_status": "SUCCESS" is the only
 * thing that lets a webhook move money in this app.
 */
export async function verifyWebhookSignature(headers: Headers, event: unknown) {
  const webhookId = paypalWebhookId();
  if (!webhookId || isSimulated()) {
    return { ok: true, simulated: true, status: 200, data: { verification_status: "SIMULATED" } } as PayPalResult<{ verification_status: string }>;
  }
  return rest<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: event,
  });
}

export { paypalMode, paypalConfigured, paypalWebBase };
