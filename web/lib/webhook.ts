/* =========================================================
   Tiny in-memory bus for verified PayPal webhook events.
   A production build would persist these (Postgres/KV); for
   the hackathon demo the buffer lets the Agent activity
   panel show REAL push events right after they arrive.
   ========================================================= */

export interface HookEvent {
  at: string;              // ISO time we received it
  id: string;              // PayPal event id
  type: string;            // e.g. PAYMENT.CAPTURE.COMPLETED
  verified: boolean;       // signature check result
  verification: string;    // SUCCESS / WEBHOOK_ID_NOT_CONFIGURED / …
  resource: string;        // resource id (capture / refund / batch)
  status: string;          // resource status
  amount?: string;         // "150.00 USD"
  orderId?: string;        // Lunas order ref (custom_id / reference_id)
}

const MAX = 25;
let buf: HookEvent[] = [];

export const pushEvent = (e: HookEvent) => {
  buf = [e, ...buf].slice(0, MAX);
  return e;
};

export const recentEvents = () => buf;

/** Map a PayPal event onto the escrow state machine (what Lunas would do). */
export function actionFor(type: string): string {
  if (type === "CHECKOUT.ORDER.APPROVED") return "order → IN_ESCROW (funded)";
  if (type === "PAYMENT.CAPTURE.COMPLETED") return "order → IN_ESCROW · notify freelancer";
  if (type === "PAYMENT.CAPTURE.DENIED" || type === "PAYMENT.CAPTURE.REVERSED") return "order → NEEDS_ATTENTION · freeze release";
  if (type === "PAYMENT.CAPTURE.REFUNDED") return "order → REFUNDED · certificate voided";
  if (type === "PAYMENT.PAYOUTS-BATCH.SUCCESS" || type === "PAYMENT.PAYOUTSBATCH.SUCCESS") return "order → LUNAS ✓ · issue certificate";
  if (type === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" || type === "PAYMENT.PAYOUTS.ITEM.SUCCEEDED") return "payout delivered → LUNAS ✓";
  if (type === "PAYMENT.PAYOUTS-ITEM.FAILED" || type === "PAYMENT.PAYOUTS.ITEM.FAILED") return "payout failed → retry / refund";
  if (type === "PAYMENT.REFUND.COMPLETED") return "refund settled → client notified";
  if (type === "CUSTOMER.DISPUTE.CREATED") return "dispute opened → Mediator Agent";
  if (type === "CUSTOMER.DISPUTE.RESOLVED") return "dispute closed → update order state";
  if (type.startsWith("CUSTOMER.DISPUTE")) return "dispute updated → Mediator Agent";
  return "logged";
}

/* Outbound PayPal API call ledger — so any payment attempt (yours, a judge's,
   a bot's) is traceable via GET /api/paypal/webhook even without a database. */
export interface ApiCall {
  at: string;
  op: "orders.create" | "orders.capture" | "payouts.create" | "captures.refund" | "webhook.verify";
  detail: string;
  ok: boolean;
  ref?: string;
}
let calls: ApiCall[] = [];
export const pushCall = (c: ApiCall) => { calls = [c, ...calls].slice(0, 30); return c; };
export const recentCalls = () => calls;
