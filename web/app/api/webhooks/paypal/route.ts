import { fail, json } from "@/lib/server/http";
import { applyWebhookEvent } from "@/lib/server/flow";
import { verifyWebhookSignature } from "@/lib/server/paypal";
import { paypalWebhookId } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/paypal
 *
 * Registered events:
 *   PAYMENT.CAPTURE.COMPLETED / DENIED / REFUNDED
 *   PAYMENT.PAYOUTSBATCH.SUCCESS / DENIED
 *
 * Signatures are verified with PayPal before any escrow state is touched. Without
 * PAYPAL_WEBHOOK_ID (local dev) events are accepted but marked as unverified, so a demo
 * never silently trusts an unsigned payload in production.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    let event: { id?: string; event_type?: string; resource?: Record<string, unknown> };
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Body must be JSON" }, 400);
    }

    const verdict = await verifyWebhookSignature(req.headers, event);
    const verificationStatus = verdict.simulated && !paypalWebhookId()
      ? "UNVERIFIED_DEV"
      : verdict.ok && verdict.data?.verification_status === "SUCCESS"
        ? "SUCCESS"
        : "FAILED";

    if (verificationStatus === "FAILED") {
      return json({ ok: false, error: "Webhook signature verification failed", detail: verdict.error }, 401);
    }

    const outcome = await applyWebhookEvent(event);
    return json({
      ok: true,
      verificationStatus,
      eventType: event.event_type ?? "UNKNOWN",
      ...outcome,
    });
  } catch (e) {
    return fail(e);
  }
}

/** GET — handy when checking that the endpoint is reachable from the PayPal dashboard. */
export async function GET() {
  return json({
    ok: true,
    endpoint: "/api/webhooks/paypal",
    subscribeTo: [
      "PAYMENT.CAPTURE.COMPLETED",
      "PAYMENT.CAPTURE.DENIED",
      "PAYMENT.CAPTURE.REFUNDED",
      "PAYMENT.PAYOUTSBATCH.SUCCESS",
      "PAYMENT.PAYOUTSBATCH.DENIED",
    ],
    signatureVerification: paypalWebhookId() ? "enabled" : "disabled (set PAYPAL_WEBHOOK_ID)",
  });
}
