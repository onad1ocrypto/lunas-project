/**
 * Signed order tickets.
 *
 * Why this exists: on a serverless host every request may land on a different instance,
 * so an in-memory ledger is not enough — an order created one minute ago can be invisible
 * to the next request ("order not found" in front of a judge).
 *
 * Instead of requiring a database for a demo, the API hands the client a compact,
 * HMAC-signed snapshot of the order. The browser keeps it (localStorage) and sends it back
 * on every follow-up call. The server trusts it only if the signature verifies, then
 * hydrates its own store with it.
 *
 * Security notes:
 *  - the secret is server-side only and never sent to the browser;
 *  - the payload is tamper-evident (timing-safe comparison), so a client cannot inflate an
 *    amount or forge a "paid" status without breaking the signature;
 *  - money movements still always go through PayPal with the captured ids, so a forged
 *    ticket can at worst produce a wrong-looking screen, never a wrong transfer.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const VERSION = 1;

function secret() {
  return (
    process.env.LUNAS_TICKET_SECRET ||
    process.env.PAYPAL_CLIENT_SECRET || // already present in every real deployment
    "lunas-dev-insecure-ticket-secret" // local dev / simulation only
  );
}

/** Trim a snapshot down to what follow-up calls actually need. */
export function compactSnapshot<T extends Record<string, any>>(order: T): T {
  const clone: Record<string, any> = { ...order };
  if (Array.isArray(clone.deliverables)) {
    clone.deliverables = clone.deliverables.map((d: Record<string, any>) => ({ ...d, text: undefined }));
  }
  if (Array.isArray(clone.events) && clone.events.length > 24) {
    clone.events = clone.events.slice(-24);
  }
  return clone as T;
}

export function signTicket(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ v: VERSION, ...payload }), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyTicket<T = Record<string, unknown>>(ticket: string | null | undefined): T | null {
  if (!ticket || typeof ticket !== "string" || !ticket.includes(".")) return null;
  const [body, mac] = ticket.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { v?: number };
    if (parsed?.v !== VERSION) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export const TICKET_HEADER = "x-lunas-ticket";

/**
 * Attach a freshly signed ticket to a response payload.
 *
 * Tickets go stale the moment the order changes (escrow funded, delivery verified, paid).
 * Every state-changing response therefore re-issues one, and the browser stores the newest
 * — otherwise a cold start would resurrect an old status, which is exactly the bug that
 * made a funded order show up as "awaiting payment".
 */
export function withTicket<T extends { order?: { id: string } | null }>(payload: T): T & { ticket?: string } {
  const order = payload?.order;
  if (!order || typeof order.id !== "string") return payload;
  return { ...payload, ticket: signTicket({ order: compactSnapshot(order as Record<string, unknown>) }) };
}
