/* =========================================================
   Incoming requests — the client side of the pipe.

   A client fills the form on /to/<handle>; the request is stored by
   /api/requests (Supabase Storage) so it reaches the freelancer even from
   another device. This module is what the dashboard reads: it merges the
   server's copy with anything kept in this browser (offline demo, or a
   request sent before storage was configured), and it can turn a request
   into the same `Order` shape every other screen already understands.

   Everything here is browser-only; the server route never imports it.
   ========================================================= */

import type { Criterion, Order, Person, ProductKind } from "./data";
import { lsGet, lsSet } from "./safeStorage";

export interface IncomingRequest {
  id: string;
  handle: string;
  name: string;
  email: string;
  brief: string;
  title?: string;
  budget: number;
  criteria: Criterion[];
  createdAt: string;
  status: "new" | "accepted" | "declined";
}

const pendingKey = (handle: string) => `lunas.req.${handle || "guest"}`;
const ORDERS_KEY = "lunas.myOrders";
const HANDLES_KEY = "lunas.reqHandles";

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = lsGet(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try {
    lsSet(key, JSON.stringify(value));
  } catch {
    /* private mode, full quota — the show goes on */
  }
}

export const newRequestId = () => `REQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/* ---------------------------------------------------------------
   Local copies (fallback + "sent from this browser" bookkeeping)
   --------------------------------------------------------------- */

export function localRequests(handle: string): IncomingRequest[] {
  const all = readLS<IncomingRequest[]>(pendingKey(handle), []);
  return all.filter((r) => r && r.id);
}

export function saveLocalRequest(r: IncomingRequest) {
  const list = localRequests(r.handle).filter((x) => x.id !== r.id);
  writeLS(pendingKey(r.handle), [r, ...list].slice(0, 40));
  rememberHandle(r.handle);
}

export function updateLocalRequest(id: string, patch: Partial<IncomingRequest>) {
  for (const handle of knownHandles()) {
    const list = localRequests(handle);
    if (!list.some((r) => r.id === id)) continue;
    writeLS(pendingKey(handle), list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
}

function rememberHandle(handle: string) {
  const known = readLS<string[]>(HANDLES_KEY, []);
  if (!handle || known.includes(handle)) return;
  writeLS(HANDLES_KEY, [...known, handle].slice(-8));
}

export function knownHandles(): string[] {
  return readLS<string[]>(HANDLES_KEY, []);
}

/* ---------------------------------------------------------------
   The pipe itself
   --------------------------------------------------------------- */

export async function sendRequest(p: {
  handle: string;
  name: string;
  email: string;
  brief: string;
  title?: string;
  budget: number;
  criteria: Criterion[];
}): Promise<{ id: string; stored: "server" | "local" }> {
  try {
    const r = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (r.ok) {
      const j = (await r.json()) as { id?: string; stored?: string };
      if (j?.id) {
        rememberHandle(p.handle); // this browser has now used that page — its inbox may read it
        if (j.stored !== "server") {
          // storage isn't configured on the server — keep it here so the
          // freelancer's own browser still shows the request
          saveLocalRequest({ ...p, id: j.id, createdAt: new Date().toISOString(), status: "new" });
          rememberHandle(p.handle);
        }
        return { id: j.id, stored: j.stored === "server" ? "server" : "local" };
      }
    }
  } catch {
    /* network down — fall through to the local copy */
  }
  const id = newRequestId();
  saveLocalRequest({ ...p, id, createdAt: new Date().toISOString(), status: "new" });
  return { id, stored: "local" };
}

/**
 * Which handles are *mine* — the inbox may only show requests addressed to one of
 * these. The local persona's handle, whatever handle this browser was signed in
 * under (published profile), and any /to/<handle> page used from this device
 * (that is what makes the one-browser demo work: send as a client, then look).
 */
const handleOk = (h: string) => /^[a-z0-9][a-z0-9-]{1,31}$/.test(h);

export async function myInboxHandles(fallback: string): Promise<string[]> {
  const set = new Set<string>();
  const push = (h?: string) => {
    const v = String(h ?? "").trim().toLowerCase();
    if (handleOk(v)) set.add(v);
  };
  push(fallback);
  knownHandles().forEach(push);
  try {
    const r = await fetch("/api/profile", { cache: "no-store" });
    if (r.ok) push((await r.json() as { handle?: string })?.handle);
  } catch {
    /* not signed in / offline — the other handles still count */
  }
  return [...set];
}

/** Everything waiting in the inbox for this freelancer: server + this browser. */
export async function listIncoming(handle: string): Promise<IncomingRequest[]> {
  const handles = await myInboxHandles(handle);
  const local = handles.flatMap((h) => localRequests(h));
  const server: IncomingRequest[] = [];
  for (const h of handles) {
    try {
      const r = await fetch(`/api/requests?handle=${encodeURIComponent(h)}`, { cache: "no-store" });
      if (!r.ok) continue;
      const j = (await r.json()) as { requests?: IncomingRequest[] };
      if (Array.isArray(j.requests)) server.push(...j.requests);
    } catch {
      /* offline: the local copy still answers */
    }
  }
  const byId = new Map<string, IncomingRequest>();
  for (const r of [...server, ...local]) byId.set(r.id, { ...byId.get(r.id), ...r });
  return [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function setRequestStatus(id: string, status: IncomingRequest["status"]): Promise<void> {
  updateLocalRequest(id, { status });
  try {
    await fetch("/api/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  } catch {
    /* the local copy above is enough for the demo */
  }
}

/** Open a request the freelancer only knows by id (from the inbox card). */
export async function loadIncomingById(id: string): Promise<IncomingRequest | null> {
  const locals = knownHandles().flatMap((h) => localRequests(h));
  const hit = locals.find((r) => r.id === id);
  if (hit) return hit;
  try {
    const r = await fetch(`/api/requests?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { request?: IncomingRequest };
      if (j?.request) return j.request;
    }
  } catch {
    /* offline */
  }
  return null;
}

/* ---------------------------------------------------------------
   Requests as orders + the freelancer's own bookkeeping
   --------------------------------------------------------------- */

const PRODUCT_HINTS: [RegExp, ProductKind][] = [
  [/\b(reel|video|tiktok|vertical)\b/i, "reel"],
  [/\b(photo|foto|image|gambar|retouch)\b/i, "watch"],
  [/\b(logo|brand)\b/i, "candle"],
  [/\b(banner|etsy|shop|store)\b/i, "bag"],
  [/\b(slide|deck|carousel|presentation)\b/i, "mug"],
  [/\b(menu|caf|restaurant)\b/i, "cap"],
  [/\b(illustration|ilustrasi|watercolor|book)\b/i, "bottle"],
  [/\b(copy|write|writing|article|blog)\b/i, "plant"],
];

export const guessProduct = (text: string): ProductKind =>
  PRODUCT_HINTS.find(([re]) => re.test(text))?.[1] ?? "mug";

export const deriveTitle = (brief: string, title?: string) => {
  if (title && title.trim().length > 2) return title.trim().slice(0, 90);
  const words = brief.replace(/\s+/g, " ").trim().split(" ").slice(0, 7).join(" ");
  return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/[.,;:]$/, "");
};

/** The shape every screen already renders — a client's request is just an order. */
export function requestAsOrder(r: IncomingRequest): Order {
  const days = 14;
  const due = new Date(new Date(r.createdAt).getTime() + days * 86_400_000);
  const client: Person = {
    name: r.name,
    initials: initials(r.name),
    city: "",
    country: "", // the public form doesn't ask where the client lives — don't invent it
    color: "var(--sky-l)",
  };
  return {
    id: r.id,
    direction: "from_client",
    title: deriveTitle(r.brief, r.title),
    client,
    amount: Number(r.budget) || 0,
    currency: "USD",
    due: due.toISOString().slice(0, 10),
    created: String(r.createdAt).slice(0, 10),
    status: "request",
    brief: r.brief,
    criteria: r.criteria,
    accent: "var(--pink)",
    product: guessProduct(`${r.title ?? ""} ${r.brief} ${r.criteria.map((c) => c.label).join(" ")}`),
  };
}

/* orders this browser created (accepted requests, etc.) */

export function saveMyOrder(o: Order) {
  const all = readLS<Order[]>(ORDERS_KEY, []).filter((x) => x.id !== o.id);
  writeLS(ORDERS_KEY, [o, ...all].slice(0, 60));
}

export function myOrder(id: string): Order | null {
  return readLS<Order[]>(ORDERS_KEY, []).find((o) => o.id === id) ?? null;
}

export function myOrders(): Order[] {
  return readLS<Order[]>(ORDERS_KEY, []);
}
