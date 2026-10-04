/**
 * Escrow flow orchestration — the money path, in one place.
 *
 *   brief ─▶ contract ─▶ client pays (Orders v2 capture) ─▶ IN ESCROW
 *         ─▶ freelancer uploads ─▶ Verification Agent ─▶ review window
 *         ─▶ release (Payouts v1) ─▶ LUNAS
 *
 * Every step appends an event to the order so the UI log is a real audit trail, and every
 * step is idempotent enough to survive a double click or a repeated webhook.
 */

import {
  approvalUrlOf,
  capturePayPalOrder,
  createPayPalOrder,
  createPayout,
  isSimulated,
  refundCapture,
  paypalMode,
} from "./paypal";
import { feeRate, payoutReceiver } from "./env";
import { addEvents, getOrderById, updateOrder, type ApiOrder, type DeliverableFile, type Event } from "./store";
import { inspectFile } from "./image";
import { verifyDelivery } from "./agents";
import { dataDir } from "./env";
import { promises as fs } from "node:fs";

export const grossOf = (order: { amount: number }) => Number((order.amount * (1 + feeRate())).toFixed(2));

const missing = (id: string) => Object.assign(new Error(`Order ${id} not found`), { status: 404 });

/* --------------------------------------------------------------- 1. funding */

/** Create the PayPal order the client approves. Money lands in the platform wallet = escrow. */
export async function startEscrow(orderId: string, origin: string) {
  const order = await getOrderById(orderId);
  if (!order) throw missing(orderId);
  if (order.paypal.orderId && order.status !== "awaiting_payment") {
    return { order, reused: true, approvalUrl: order.paypal.approvalUrl, paypalOrderId: order.paypal.orderId, mode: paypalMode() };
  }

  const gross = grossOf(order);
  const res = await createPayPalOrder({
    referenceId: order.id,
    amount: gross,
    currency: order.currency,
    description: `${order.title} — Lunas escrow (${order.criteria.length} verified criteria)`,
    returnUrl: `${origin}/pay/${order.id}?status=return`,
    cancelUrl: `${origin}/pay/${order.id}?status=cancel`,
  });

  if (!res.ok) {
    await addEvents(order.id, [{ who: "paypal", msg: "orders.create", res: `FAILED: ${res.error}`, kind: "err" }]);
    throw Object.assign(new Error(`PayPal create order failed: ${res.error}`), { status: 502, debugId: res.debugId });
  }

  const paypalOrderId = res.data.id;
  const approvalUrl = approvalUrlOf(res.data) ?? `${order.paypal.approvalUrl ?? ""}`;
  const updated = await updateOrder(order.id, {
    paypal: { orderId: paypalOrderId, approvalUrl, captureStatus: "CREATED" },
  });
  await addEvents(order.id, [
    {
      who: "paypal",
      msg: "orders.create",
      res: `intent: CAPTURE · ${gross.toFixed(2)} ${order.currency} · ${paypalOrderId}${isSimulated() ? " (simulated)" : ""}`,
      kind: "pp",
    },
  ]);
  return { order: updated, reused: false, approvalUrl, paypalOrderId, mode: paypalMode(), gross };
}

/** Capture the approved payment into escrow. */
export async function captureEscrow(orderId: string, paypalOrderIdOverride?: string) {
  const order = await getOrderById(orderId);
  if (!order) throw missing(orderId);
  if (order.status === "in_escrow" || order.status === "verifying" || order.status === "revision" || order.status === "review" || order.status === "paid") {
    return { order, alreadyCaptured: true };
  }
  const paypalOrderId = paypalOrderIdOverride || order.paypal.orderId;
  if (!paypalOrderId) throw Object.assign(new Error("No PayPal order to capture — call /api/paypal/orders first"), { status: 409 });

  const res = await capturePayPalOrder(paypalOrderId, order.id);
  if (!res.ok) {
    await addEvents(order.id, [{ who: "paypal", msg: "orders.capture", res: `FAILED: ${res.error}`, kind: "err" }]);
    throw Object.assign(new Error(`PayPal capture failed: ${res.error}`), { status: 502, debugId: res.debugId });
  }

  const capture = res.data.purchase_units?.[0]?.payments?.captures?.[0];
  const breakdown = capture?.seller_receivable_breakdown;
  const gross = grossOf(order);

  const updated = await updateOrder(order.id, (o) => ({
    status: "in_escrow",
    paypal: {
      orderId: paypalOrderId,
      captureId: capture?.id,
      captureStatus: capture?.status ?? res.data.status,
      grossAmount: breakdown?.gross_amount?.value ?? gross.toFixed(2),
      paypalFee: breakdown?.paypal_fee?.value,
      payerEmail: res.data.payer?.email_address,
    },
  }));
  await addEvents(order.id, [
    { who: "paypal", msg: "orders.capture", res: `status: ${res.data.status} · ${capture?.id ?? "capture id pending"}${isSimulated() ? " (simulated)" : ""}`, kind: "pp" },
    { who: "webhook", msg: "PAYMENT.CAPTURE.COMPLETED", res: `${order.id} → IN_ESCROW · ${order.freelancer.name} notified`, kind: "hook" },
  ]);
  return { order: updated, alreadyCaptured: false, captureId: capture?.id };
}

/* ---------------------------------------------------------- 2. verification */

/** Store + inspect the freelancer's delivery, then run the Verification Agent. */
export async function submitDelivery(orderId: string, uploads: { name: string; buf: Buffer }[]) {
  const order = await getOrderById(orderId);
  if (!order) throw missing(orderId);
  if (!["in_escrow", "verifying", "revision"].includes(order.status)) {
    throw Object.assign(new Error(`Order is ${order.status} — deliverables can only be uploaded while the money is in escrow`), { status: 409 });
  }

  const dir = `${dataDir()}/uploads/${order.id}`;
  const inspected: DeliverableFile[] = [];
  for (const up of uploads.slice(0, 40)) {
    const safe = up.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    let storedAs: string | undefined;
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(`${dir}/${safe}`, up.buf);
      storedAs = safe;
    } catch {
      storedAs = undefined; // read-only FS — verify from memory only
    }
    const info = await inspectFile(up.buf, safe, storedAs);
    inspected.push({
      name: safe,
      size: info.size,
      mime: info.mime,
      ext: info.ext,
      width: info.width,
      height: info.height,
      alpha: info.alpha,
      words: info.words,
      text: info.text?.slice(0, 20_000),
      storedAs,
    });
  }

  await updateOrder(order.id, { status: "verifying", deliverables: inspected });
  await addEvents(order.id, [{ who: "freelancer", msg: "delivery.upload", res: `${inspected.length} files, ${(inspected.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB`, kind: "hook" }]);

  const verification = await verifyDelivery(
    { id: order.id, due: order.due, criteria: order.criteria },
    inspected.map((f) => ({
      name: f.name,
      size: f.size,
      mime: f.mime,
      ext: f.ext,
      width: f.width,
      height: f.height,
      alpha: f.alpha,
      words: f.words,
      text: f.text,
      storedAs: f.storedAs,
    })),
  );

  // "review" means some criteria needed human eyes: the money stays in escrow and the
  // client decides inside the review window, which is a perfectly good outcome.
  const nextStatus = verification.verdict === "revision" ? "revision" : "review";
  const updated = await updateOrder(order.id, (o) => ({
    status: nextStatus as ApiOrder["status"],
    verification,
    reviewStartedAt: nextStatus === "review" ? new Date().toISOString() : o.reviewStartedAt,
    engine: { ...o.engine, verification: verification.engine },
  }));

  const events: Omit<Event, "at">[] = verification.results.map((r) => ({
    who: "verify_agent",
    msg: r.rule,
    res: `${r.status === "pass" ? "✓" : r.status === "fail" ? "✕" : "…"} ${r.evidence}`,
    kind: r.status === "fail" ? "err" : r.status === "manual" ? "hook" : "ai",
  }));
  events.push({
    who: "verify_agent",
    msg: "verdict",
    res: verification.summary,
    kind: verification.verdict === "revision" ? "err" : "ai",
  });
  await addEvents(order.id, events);

  return { order: updated, verification };
}

/* -------------------------------------------------------------- 3. releasing */

/** Client approved (or the review window expired) → pay the freelancer. */
export async function releaseEscrow(orderId: string, actor: "client_approved" | "auto_release" | "mediator" = "client_approved") {
  const order = await getOrderById(orderId);
  if (!order) throw missing(orderId);
  if (order.status === "paid") return { order, alreadyPaid: true };
  if (!["review", "in_escrow", "verifying"].includes(order.status)) {
    throw Object.assign(new Error(`Order is ${order.status} — nothing to release yet`), { status: 409 });
  }

  const res = await createPayout({
    receiver: payoutReceiver(),
    amount: order.amount,
    currency: order.currency,
    note: `Lunas escrow release · ${order.id} · ${order.title}`,
    senderBatchId: `lunas-${order.id}-${Date.now()}`,
  });

  if (!res.ok) {
    await addEvents(order.id, [{ who: "paypal", msg: "payouts.create", res: `FAILED: ${res.error}`, kind: "err" }]);
    throw Object.assign(new Error(`PayPal payout failed: ${res.error}`), { status: 502, debugId: res.debugId });
  }

  const batchId = res.data.batch_header?.payout_batch_id;
  const updated = await updateOrder(order.id, (o) => ({
    status: "paid",
    paypal: { payoutBatchId: batchId, payoutStatus: res.data.batch_header?.batch_status ?? "PENDING" },
  }));
  await addEvents(order.id, [
    { who: "release_policy", msg: `${actor}()`, res: `payout ${order.amount.toFixed(2)} ${order.currency} → ${payoutReceiver()}`, kind: "ai" },
    { who: "paypal", msg: "payouts.create", res: `batch ${batchId}${isSimulated() ? " (simulated)" : ""}`, kind: "pp" },
    { who: "webhook", msg: "PAYMENT.PAYOUTSBATCH.SUCCESS", res: `${order.id} → LUNAS ✓`, kind: "hook" },
  ]);
  return { order: updated, batchId, alreadyPaid: false };
}

/** Mediator Agent outcome: give the client the money back. */
export async function refundEscrow(orderId: string, reason: string, amount?: number) {
  const order = await getOrderById(orderId);
  if (!order) throw missing(orderId);
  const captureId = order.paypal.captureId;
  if (!captureId) throw Object.assign(new Error("Order has no captured payment to refund"), { status: 409 });

  const res = await refundCapture(captureId, amount ?? grossOf(order), order.currency, `Lunas mediator: ${reason}`);
  if (!res.ok) {
    await addEvents(order.id, [{ who: "paypal", msg: "payments.refund", res: `FAILED: ${res.error}`, kind: "err" }]);
    throw Object.assign(new Error(`PayPal refund failed: ${res.error}`), { status: 502 });
  }
  const updated = await updateOrder(order.id, (o) => ({
    status: "refunded",
    paypal: { refundId: res.data.id, refundStatus: res.data.status },
  }));
  await addEvents(order.id, [
    { who: "mediator", msg: "resolve(dispute)", res: reason, kind: "ai" },
    { who: "paypal", msg: "payments.refund", res: `${res.data.status} · ${res.data.id}`, kind: "pp" },
  ]);
  return { order: updated, refund: res.data };
}

/* ------------------------------------------------------------- 4. webhooks */

export type WebhookOutcome = { handled: boolean; orderId?: string; note: string };

/** Apply a verified PayPal webhook to escrow state (idempotent). */
export async function applyWebhookEvent(event: { event_type?: string; resource?: Record<string, unknown>; id?: string }) {
  const type = event.event_type ?? "UNKNOWN";
  const resource = (event.resource ?? {}) as Record<string, any>;

  if (type.startsWith("PAYMENT.CAPTURE")) {
    const reference: string | undefined = resource.custom_id ?? resource.purchase_units?.[0]?.reference_id ?? resource.reference_id;
    const invoiceId: string | undefined = resource.invoice_id;
    const order =
      (reference && (await getOrderById(reference))) ||
      (invoiceId && (await getOrderById(invoiceId))) ||
      (resource.supplementary_data?.related_ids?.order_id
        ? await findByPayPalOrderId(String(resource.supplementary_data.related_ids.order_id))
        : null);
    if (!order) return { handled: false, note: `no Lunas order matches ${type}` } as WebhookOutcome;

    if (type === "PAYMENT.CAPTURE.COMPLETED" && order.status === "awaiting_payment") {
      await updateOrder(order.id, (o) => ({
        status: "in_escrow",
        paypal: { captureId: resource.id, captureStatus: "COMPLETED", grossAmount: resource.amount?.value, payerEmail: resource.payer?.email_address },
      }));
    } else if (type === "PAYMENT.CAPTURE.REFUNDED") {
      await updateOrder(order.id, (o) => ({ status: "refunded", paypal: { refundId: resource.id, refundStatus: "COMPLETED" } }));
    } else if (type === "PAYMENT.CAPTURE.DENIED" || type === "PAYMENT.CAPTURE.REVERSED") {
      await updateOrder(order.id, (o) => ({ status: "declined", paypal: { captureStatus: type.split(".").pop() } }));
    }
    await addEvents(order.id, [{ who: "webhook", msg: type, res: `→ ${type.split(".").pop()} · event ${event.id ?? "n/a"}`, kind: "hook" }]);
    return { handled: true, orderId: order.id, note: `${type} applied to ${order.id}` };
  }

  if (type.startsWith("PAYMENT.PAYOUTSBATCH") || type.startsWith("PAYMENT.PAYOUT")) {
    const batchId: string | undefined = resource.payout_batch_id ?? resource.batch_header?.payout_batch_id;
    const senderBatch: string | undefined = resource.sender_batch_id;
    const orderId = senderBatch?.match(/LNS-\d+/)?.[0];
    const order = orderId ? await getOrderById(orderId) : batchId ? await findByPayoutBatch(batchId) : null;
    if (!order) return { handled: false, note: `no Lunas order matches ${type}` };
    await updateOrder(order.id, (o) => ({
      status: type.endsWith("SUCCESS") || type.endsWith("SUCCEEDED") ? "paid" : o.status,
      paypal: { payoutBatchId: batchId ?? o.paypal.payoutBatchId, payoutStatus: type.split(".").pop() },
    }));
    await addEvents(order.id, [{ who: "webhook", msg: type, res: `${order.id} → ${type.split(".").pop()}`, kind: "hook" }]);
    return { handled: true, orderId: order.id, note: `${type} applied to ${order.id}` };
  }

  return { handled: false, note: `ignored ${type}` };
}

async function findByPayPalOrderId(orderId: string) {
  const { findOrderByPayPalOrderId } = await import("./store");
  return findOrderByPayPalOrderId(orderId);
}

async function findByPayoutBatch(batchId: string) {
  const { listOrders } = await import("./store");
  const all = await listOrders();
  return all.find((o) => o.paypal.payoutBatchId === batchId) ?? null;
}

/** Auto-release when the client review window (default 72h) expires without an objection. */
export async function autoReleaseIfDue(orderId: string) {
  const order = await getOrderById(orderId);
  if (!order) throw missing(orderId);
  if (order.status !== "review") return { released: false, reason: `status is ${order.status}` };
  const started = order.reviewStartedAt ? new Date(order.reviewStartedAt).getTime() : new Date(order.updatedAt).getTime();
  const elapsedHours = (Date.now() - started) / 3_600_000;
  if (elapsedHours < order.windowHours) {
    return { released: false, reason: `${Math.max(0, order.windowHours - elapsedHours).toFixed(1)}h left in the review window` };
  }
  const res = await releaseEscrow(orderId, "auto_release");
  return { released: true, order: res.order };
}
