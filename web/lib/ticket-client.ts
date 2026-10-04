"use client";

/**
 * Client half of the signed-ticket mechanism (server side: lib/server/ticket.ts).
 *
 * After creating an order the API returns a signed snapshot. We keep it in memory and in
 * localStorage, keyed by order id, and send it back as `x-lunas-ticket` on every follow-up
 * request. On a serverless host that is what keeps the escrow flow working across cold
 * starts without a database.
 */

const KEY = "lunas.tickets";
const memory = new Map<string, string>();
let hydratedFromStorage = false;

function loadFromStorage() {
  if (hydratedFromStorage || typeof window === "undefined") return;
  hydratedFromStorage = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [id, ticket] of Object.entries(parsed)) memory.set(id, ticket);
  } catch {
    /* corrupted storage — start clean */
  }
}

function flushToStorage() {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, string> = {};
    for (const [id, ticket] of memory) obj[id] = ticket;
    window.localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode — memory still works for this session */
  }
}

export function rememberTicket(orderId: string, ticket?: string | null) {
  if (!orderId || !ticket) return;
  memory.set(orderId, ticket);
  flushToStorage();
}

export function ticketFor(orderId?: string | null) {
  if (!orderId) return undefined;
  loadFromStorage();
  return memory.get(orderId);
}

/** Pull the Lunas order id out of a URL and/or request body so we know which ticket to send. */
export function orderIdOf(url: string, body?: BodyInit | null): string | undefined {
  const fromUrl = url.match(/\/api\/(?:orders)\/([^/?#]+)/)?.[1];
  if (fromUrl && !fromUrl.includes("[") && fromUrl !== "new") return decodeURIComponent(fromUrl);
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as { orderId?: string; lunasOrderId?: string };
      return parsed.lunasOrderId ?? parsed.orderId;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
