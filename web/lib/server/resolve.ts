/**
 * Resolve an order for a request.
 *
 * Order of trust:
 *   1. the server's own store (file/in-memory),
 *   2. a signed ticket the client carries (see ./ticket.ts) — this is what makes the demo
 *      survive serverless cold starts,
 *   3. nothing → the caller returns 404 with a message a human can understand.
 */

import { getOrderById, upsertOrder, type ApiOrder } from "./store";
import { TICKET_HEADER, verifyTicket } from "./ticket";

export interface TicketSnapshot {
  order?: ApiOrder;
  [key: string]: unknown;
}

export function snapshotFromRequest(req: Request): ApiOrder | null {
  const snap = verifyTicket<TicketSnapshot>(req.headers.get(TICKET_HEADER));
  return snap?.order?.id ? snap.order : null;
}

/** Pull a ticket off the request and write it into the store (idempotent). */
export async function hydrateFromTicket(req: Request): Promise<ApiOrder | null> {
  const order = snapshotFromRequest(req);
  if (order) await upsertOrder(order);
  return order;
}

export async function resolveOrder(id: string, req: Request): Promise<ApiOrder | null> {
  const found = await getOrderById(id);
  if (found) return found;
  const fromTicket = snapshotFromRequest(req);
  if (fromTicket && fromTicket.id === id) {
    await upsertOrder(fromTicket);
    return fromTicket;
  }
  return null;
}
