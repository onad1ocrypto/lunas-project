/**
 * Order store for the Lunas escrow flow.
 *
 * Deliberately dependency-free: an in-memory map that is hydrating from / persisting to a
 * JSON file (best effort). On serverless hosts the filesystem may be read-only or ephemeral,
 * so every write is wrapped — the app keeps working in memory and the response tells the
 * caller whether the write was persisted.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir } from "./env";
import { ME, ORDERS, type Criterion } from "@/lib/data";

export type OrderStatus =
  | "request"
  | "awaiting_payment"
  | "in_escrow"
  | "verifying"
  | "revision"
  | "review"
  | "paid"
  | "declined"
  | "refunded";

export interface DeliverableFile {
  name: string;
  size: number;
  mime: string;
  ext: string;
  width?: number;
  height?: number;
  alpha?: boolean;
  words?: number;
  text?: string;
  storedAs?: string;
}

export interface CriterionResult {
  label: string;
  rule: string;
  status: "pass" | "fail" | "manual";
  evidence: string;
  engine: "rules" | "vision" | "heuristic" | "human";
}

export interface Verification {
  verdict: "pass" | "revision" | "review";
  results: CriterionResult[];
  summary: string;
  engine: "rules+vision" | "rules" | "heuristic";
  at: string;
}

export interface Event {
  at: string;
  who: string;
  msg: string;
  res?: string;
  kind: "ai" | "pp" | "hook" | "err";
}

export interface PayPalRefs {
  orderId?: string;
  approvalUrl?: string;
  captureId?: string;
  captureStatus?: string;
  capturedAmount?: string;
  grossAmount?: string;
  paypalFee?: string;
  payoutBatchId?: string;
  payoutStatus?: string;
  refundId?: string;
  refundStatus?: string;
  payerEmail?: string;
}

export interface ApiOrder {
  id: string;
  direction: "from_client" | "to_client";
  title: string;
  brief: string;
  amount: number;
  currency: string;
  due: string;
  windowHours: number;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  client: { name: string; email: string; city: string; country: string };
  freelancer: { name: string; email: string; city: string; country: string };
  criteria: Criterion[];
  deliverables: DeliverableFile[];
  verification?: Verification;
  /** When the delivery passed verification and the client review window started. */
  reviewStartedAt?: string;
  paypal: PayPalRefs;
  events: Event[];
  engine: { contract: "llm" | "heuristic"; verification?: "rules+vision" | "rules" | "heuristic" };
}

const FILE = () => path.join(dataDir(), "orders.json");
/** Starts above the seeded demo range (LNS-0129…LNS-0151) so ids never collide. */
const SEQ = { n: 1600 };

let cache: Map<string, ApiOrder> | null = null;
let persistDisabled = false;

function seed(): Map<string, ApiOrder> {
  const map = new Map<string, ApiOrder>();
  for (const o of ORDERS) {
    map.set(o.id, {
      id: o.id,
      direction: o.direction,
      title: o.title,
      brief: o.brief,
      amount: o.amount,
      currency: o.currency,
      due: o.due,
      windowHours: 72,
      createdAt: `${o.created}T09:00:00.000Z`,
      updatedAt: `${o.created}T09:00:00.000Z`,
      status: o.status,
      client: { name: o.client.name, email: `${o.client.name.split(" ")[0].toLowerCase()}@example.com`, city: o.client.city, country: o.client.country },
      freelancer: { name: ME.name, email: "sari.wulandari-facilitator@example.com", city: ME.city, country: ME.country },
      criteria: o.criteria,
      deliverables: [],
      paypal: {},
      events: [{ at: `${o.created}T09:00:00.000Z`, who: "contract_agent", msg: "parse_brief()", res: `${o.criteria.length} checkable criteria`, kind: "ai" }],
      engine: { contract: "heuristic" },
    });
  }
  return map;
}

async function load(): Promise<Map<string, ApiOrder>> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE(), "utf8");
    const parsed = JSON.parse(raw) as { orders: ApiOrder[]; seq?: number };
    cache = new Map(parsed.orders.map((o) => [o.id, o]));
    if (parsed.seq) SEQ.n = parsed.seq;
  } catch {
    cache = seed();
  }
  return cache;
}

async function persist() {
  if (persistDisabled || !cache) return false;
  try {
    await fs.mkdir(dataDir(), { recursive: true });
    await fs.writeFile(FILE(), JSON.stringify({ seq: SEQ.n, orders: [...cache.values()] }, null, 2), "utf8");
    return true;
  } catch {
    persistDisabled = true; // read-only FS (serverless) — stay in memory
    return false;
  }
}

export async function listOrders() {
  const map = await load();
  return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getOrderById(id: string) {
  const map = await load();
  return map.get(id) ?? null;
}

export async function createOrder(input: {  direction: "from_client" | "to_client";
  title: string;
  brief: string;
  amount: number;
  currency: string;
  due: string;
  windowHours?: number;
  client: { name: string; email: string; city?: string; country?: string };
  criteria: Criterion[];
  contractEngine: "llm" | "heuristic";
}) {
  const map = await load();
  let id = "";
  do {
    SEQ.n += 1;
    id = `LNS-${SEQ.n}`;
  } while (map.has(id)); // never reuse an id (seeded demo orders, or a rehydrated one)
  const now = new Date().toISOString();
  const order: ApiOrder = {
    id,
    direction: input.direction,
    title: input.title || "New order",
    brief: input.brief,
    amount: input.amount,
    currency: input.currency || "USD",
    due: input.due,
    windowHours: input.windowHours ?? 72,
    createdAt: now,
    updatedAt: now,
    status: "awaiting_payment",
    client: { name: input.client.name, email: input.client.email, city: input.client.city ?? "—", country: input.client.country ?? "US" },
    freelancer: { name: ME.name, email: "sari.wulandari-facilitator@example.com", city: ME.city, country: ME.country },
    criteria: input.criteria,
    deliverables: [],
    paypal: {},
    events: [
      { at: now, who: "contract_agent", msg: "draft_contract()", res: `${input.criteria.length} checkable criteria · engine: ${input.contractEngine}`, kind: "ai" },
      { at: now, who: "escrow", msg: "contract_signed()", res: `sha256: ${fakeHash(id)}`, kind: "hook" },
    ],
    engine: { contract: input.contractEngine },
  };
  map.set(id, order);
  const persisted = await persist();
  return { order, persisted };
}

/** Insert or replace an order — used when a signed client ticket rehydrates state. */
export async function upsertOrder(order: ApiOrder) {
  const map = await load();
  map.set(order.id, order);
  const n = Number(order.id.replace(/\D/g, ""));
  if (Number.isFinite(n) && n > SEQ.n) SEQ.n = n;
  await persist();
  return order;
}

export function fakeHash(seed: string) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h1 ^= seed.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  let h2 = 0x1000193 ^ h1;
  for (let i = seed.length - 1; i >= 0; i--) {
    h2 ^= seed.charCodeAt(i);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}

export async function updateOrder(id: string, patch: Partial<ApiOrder> | ((o: ApiOrder) => Partial<ApiOrder>)) {
  const map = await load();
  const current = map.get(id);
  if (!current) return null;
  const delta = typeof patch === "function" ? patch(current) : patch;
  const next: ApiOrder = {
    ...current,
    ...delta,
    paypal: { ...current.paypal, ...(delta.paypal ?? {}) },
    engine: { ...current.engine, ...(delta.engine ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  map.set(id, next);
  await persist();
  return next;
}

export async function addEvents(id: string, events: Omit<Event, "at">[]) {
  const map = await load();
  const current = map.get(id);
  if (!current) return null;
  const now = new Date().toISOString();
  current.events = [...current.events, ...events.map((e) => ({ ...e, at: now }))];
  current.updatedAt = now;
  await persist();
  return current;
}

/** Cheap natural-key lookup so a client checkout link can use either id. */
export async function findOrderByPayPalOrderId(paypalOrderId: string) {
  const map = await load();
  for (const o of map.values()) if (o.paypal.orderId === paypalOrderId) return o;
  return null;
}
