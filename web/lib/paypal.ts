/* =========================================================
   PayPal REST client (server-side only).
   Sandbox by default; set PAYPAL_LIVE=1 for production.
   Activated when PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET exist.

   Reviewed against the APIMatic PayPal Server SDK Context Plugin's TypeScript
   skills (see docs/apimatic-context-plugin.md). The skills describe the
   generated SDK's client, so their guidance is applied here as transport rules
   for plain fetch calls:

   - every attempt carries its own timeout — a client built with no timeout
     waits indefinitely on a provider that accepts the connection then stalls
     (typescript-configuration-resilience)
   - transient failures are retried on 408/429/500/502/503/504, with backoff and
     a total wait budget, because raising the retry count alone achieves nothing
     when the budget is exhausted (same file)
   - a request is only retried when it can safely be repeated: PayPal's
     idempotency header is what makes that true for POSTs
   - errors carry PayPal's own wire fields, `debug_id` included, so support can
     trace a failed call (typescript-error-handling)
   ========================================================= */

export const paypalEnabled = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const BASE = () =>
  process.env.PAYPAL_LIVE === "1" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

/* ---------- transport policy ---------- */

const ATTEMPT_TIMEOUT_MS = 15_000; // per attempt, like the SDK's per-attempt timeout
const TOKEN_TIMEOUT_MS = 10_000; // the token call is not covered by a caller's signal, so it gets its own
const MAX_ATTEMPTS = 3; // first call + 2 retries
const BASE_DELAY_MS = 400;
const MAX_TOTAL_WAIT_MS = 6_000; // the budget: retries stop once this is spent
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** PayPal's error body, wire field names preserved. */
interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: { issue?: string; description?: string; field?: string; value?: string }[];
  links?: { href?: string; rel?: string }[];
}

/**
 * An error PayPal itself described. `message` reads well in a log line and a
 * toast, and keeps `debug_id` so a failed payment can be traced with PayPal.
 */
export class PayPalApiError extends Error {
  readonly status: number;
  readonly paypalName?: string;
  readonly debugId?: string;
  readonly details: NonNullable<PayPalErrorBody["details"]>;
  readonly operation: string;

  constructor(operation: string, status: number, body: PayPalErrorBody) {
    const detail = body.details?.[0]?.description || body.details?.[0]?.issue;
    const parts = [
      `${operation} failed (${status}${body.name ? ` ${body.name}` : ""})`,
      body.message || detail,
      detail && body.message ? detail : undefined,
      body.debug_id ? `debug_id ${body.debug_id}` : undefined,
    ].filter(Boolean);
    super(parts.join(" — "));
    this.name = "PayPalApiError";
    this.operation = operation;
    this.status = status;
    this.paypalName = body.name;
    this.debugId = body.debug_id;
    this.details = body.details ?? [];
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

interface CallOptions {
  /** PayPal's `PayPal-Request-Id`. Present = the call may be retried safely. */
  idempotencyKey?: string;
  /** Extra headers (e.g. the partner attribution id). */
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * One PayPal call: explicit timeout, bounded retries for transient failures,
 * and errors that carry PayPal's own description of what went wrong.
 *
 * A POST is only retried when it carries an idempotency key — without one, a
 * retry is a second call, not the same call again.
 */
async function paypalFetch<T>(
  operation: string,
  path: string,
  init: { method: string; body?: unknown; token?: string } & CallOptions
): Promise<T> {
  const bearer = init.token ?? (await token());
  const method = init.method;
  const canRetry = Boolean(init.idempotencyKey);
  const timeoutMs = init.timeoutMs ?? ATTEMPT_TIMEOUT_MS;

  let spent = 0;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${BASE()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          ...(init.idempotencyKey ? { "PayPal-Request-Id": init.idempotencyKey } : {}),
          ...(init.headers ?? {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const timedOut = controller.signal.aborted;
      lastError = new Error(
        timedOut ? `${operation} timed out after ${timeoutMs}ms` : `${operation} could not reach PayPal (${String(e)})`
      );
      if (attempt < MAX_ATTEMPTS && canRetry && spent + BASE_DELAY_MS * 2 ** (attempt - 1) <= MAX_TOTAL_WAIT_MS) {
        const wait = BASE_DELAY_MS * 2 ** (attempt - 1);
        spent += wait;
        await sleep(wait);
        continue;
      }
      throw lastError;
    }
    clearTimeout(timer);

    if (res.ok) return await readJson<T>(res);

    const body = await readJson<PayPalErrorBody>(res);
    lastError = new PayPalApiError(operation, res.status, body);

    const retryable = RETRY_STATUS.has(res.status);
    if (attempt < MAX_ATTEMPTS && canRetry && retryable) {
      // 429 tells us how long to wait; honour it, but stay inside the budget.
      const retryAfter = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_TOTAL_WAIT_MS)
        : BASE_DELAY_MS * 2 ** (attempt - 1);
      if (spent + backoff > MAX_TOTAL_WAIT_MS) break;
      spent += backoff;
      await sleep(backoff);
      continue;
    }
    break;
  }

  throw lastError ?? new Error(`${operation} failed`);
}

/* ---------- auth ---------- */

let cache: { tok: string; exp: number } | null = null;

/**
 * Client-credentials token, cached until shortly before it expires.
 *
 * The token request is a call of its own: it does not inherit a caller's
 * timeout, so it carries its own, and it is retried because
 * `client_credentials` can be repeated safely.
 */
async function token(): Promise<string> {
  if (cache && cache.exp > Date.now()) return cache.tok;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");

  let spent = 0;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
    try {
      const r = await fetch(`${BASE()}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (r.ok) {
        const j = (await r.json()) as { access_token: string; expires_in: number };
        cache = { tok: j.access_token, exp: Date.now() + (j.expires_in - 90) * 1000 };
        return cache.tok;
      }
      const body = await readJson<PayPalErrorBody>(r);
      lastError = new PayPalApiError("oauth2.token", r.status, body);
      if (!RETRY_STATUS.has(r.status)) break;
    } catch (e) {
      clearTimeout(timer);
      lastError = new Error(`oauth2.token could not reach PayPal (${String(e)})`);
    }
    if (attempt < MAX_ATTEMPTS && spent + BASE_DELAY_MS * 2 ** (attempt - 1) <= MAX_TOTAL_WAIT_MS) {
      const wait = BASE_DELAY_MS * 2 ** (attempt - 1);
      spent += wait;
      await sleep(wait);
      continue;
    }
    break;
  }
  throw lastError ?? new Error("oauth2.token failed");
}

/* ---------- Orders v2 ---------- */

/** Escrow step 1 — client pays into the platform order (funds held until release). */
export async function createPayPalOrder(
  ref: { id: string; amount: number; currency: string; description: string },
  idempotencyKey?: string
) {
  const j = await paypalFetch<{ id?: string }>("orders.create", "/v2/checkout/orders", {
    method: "POST",
    // Reusing the key means a retry after a network hiccup returns the first
    // order instead of creating a second one the client could also approve.
    idempotencyKey: idempotencyKey || `${ref.id}-create`,
    body: {
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
    },
  });
  if (!j.id) throw new Error("orders.create returned no order id");
  return j.id;
}

/** Escrow step 2 — capture on client approval (sandbox: money moves to sandbox merchant). */
export async function capturePayPalOrder(paypalOrderId: string) {
  const j = await paypalFetch<{
    status?: string;
    purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
  }>("orders.capture", `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: "POST",
    // Keyed per order: a retry returns the same capture rather than a second one.
    idempotencyKey: `${paypalOrderId}-capture`,
  });
  const cap = j.purchase_units?.[0]?.payments?.captures?.[0];
  return { status: j.status ?? "UNKNOWN", captureId: cap?.id, captureStatus: cap?.status };
}

/* ---------- Payouts v1 ---------- */

/**
 * Release — pay the freelancer via Payouts (sandbox enablement required on the app).
 *
 * Two independent levers stop a retry from paying twice, and both must be
 * stable across attempts:
 *   - `PayPal-Request-Id`, PayPal's idempotency header
 *   - `sender_batch_id`, the batch's own identity — a fresh value per attempt
 *     creates a fresh batch, which is exactly the double-payment this guards
 */
export async function createPayout(ref: { id: string; amount: number; currency: string; receiver: string; note: string }) {
  const batchId = `${ref.id}-payout`;
  const j = await paypalFetch<{ batch_header?: { payout_batch_id: string; batch_status: string } }>(
    "payouts.create",
    "/v1/payments/payouts",
    {
      method: "POST",
      idempotencyKey: batchId,
      headers: { "PayPal-Partner-Attribution-Id": "lunas-hackathon" },
      body: {
        sender_batch_header: { sender_batch_id: batchId, email_subject: "You got paid on Lunas!" },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: ref.receiver,
            amount: { currency: ref.currency, value: ref.amount.toFixed(2) },
            note: ref.note.slice(0, 255),
            sender_item_id: ref.id,
          },
        ],
      },
    }
  );
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

export async function verifyWebhookSignature(
  h: WebhookHeaders,
  rawBody: string
): Promise<{ verified: boolean; status: string; detail?: string }> {
  const wid = process.env.PAYPAL_WEBHOOK_ID;
  if (!wid) return { verified: false, status: "WEBHOOK_ID_NOT_CONFIGURED" };
  if (!h.transmissionId || !h.transmissionSig || !h.certUrl || !h.transmissionTime)
    return { verified: false, status: "MISSING_HEADERS" };

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { verified: false, status: "BAD_BODY" };
  }

  try {
    const j = await paypalFetch<{ verification_status?: string }>(
      "notifications.verify-webhook-signature",
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        // Verifying is a question about a stored event, so asking twice is safe.
        idempotencyKey: `${h.transmissionId}-verify`,
        body: {
          auth_algo: h.authAlgo,
          cert_url: h.certUrl,
          transmission_id: h.transmissionId,
          transmission_sig: h.transmissionSig,
          transmission_time: h.transmissionTime,
          webhook_id: wid,
          webhook_event: event,
        },
      }
    );
    return { verified: j.verification_status === "SUCCESS", status: j.verification_status ?? "UNKNOWN" };
  } catch (e) {
    const status = e instanceof PayPalApiError ? `VERIFY_HTTP_${e.status}` : "VERIFY_FAILED";
    return { verified: false, status, detail: String(e instanceof Error ? e.message : e) };
  }
}

/* ---------------------------------------------------------
   Refunds — money back to the client when the Mediator
   Agent rules in their favour (full or partial).
   --------------------------------------------------------- */

/**
 * The key identifies the *intent*, not the call: same order, same capture and
 * same amount ⇒ the same key, so a retry dedupes; a different amount is a
 * different refund and gets its own key. A timestamp here — what this used to
 * do — guaranteed the opposite: every retry looked like a new refund.
 */
function refundIntentKey(ref: { id: string; amount?: number }, captureId: string) {
  const amount = typeof ref.amount === "number" && ref.amount > 0 ? ref.amount.toFixed(2) : "full";
  return `${ref.id}-refund-${captureId}-${amount}`;
}

export async function refundCapture(
  captureId: string,
  ref: { id: string; amount?: number; currency?: string; reason?: string; note?: string }
) {
  const body: Record<string, unknown> = {
    note_to_payer: (ref.note || "Lunas mediator refund").slice(0, 255),
  };
  if (typeof ref.amount === "number" && ref.amount > 0)
    body.amount = { value: ref.amount.toFixed(2), currency_code: ref.currency || "USD" };

  const j = await paypalFetch<{ id?: string; status?: string }>(
    "captures.refund",
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    {
      method: "POST",
      idempotencyKey: refundIntentKey(ref, captureId),
      body,
    }
  );
  if (!j.id) throw new Error("captures.refund returned no refund id");
  return { refundId: j.id, status: j.status ?? "UNKNOWN" };
}
