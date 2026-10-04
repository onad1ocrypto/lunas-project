/* =========================================================
   Data for the Insights page (AG Studio).

   Two layers:
   1. rows derived from the orders that actually exist in the app (lib/data.ts)
   2. a seeded six-month history so the dashboard has a shape to explore

   Everything is computed deterministically — no Date.now(), no randomness —
   so the server and the client always agree.
   ========================================================= */

import { ORDERS, type Order, type Status } from "./data";

export interface OrderRow {
  id: string;
  title: string;
  client: string;
  clientCity: string;
  country: string; // ISO code
  countryName: string;
  direction: string; // from_client | to_client
  product: string;
  status: Status;
  stage: string; // human label for the escrow stage
  amount: number;
  fee: number; // Lunas + PayPal fee
  net: number; // what the freelancer receives
  currency: string;
  createdAt: string; // yyyy-mm-dd
  dueAt: string;
  releasedAt: string; // "" until released
  daysToPay: number; // days from funding to release (0 when not released)
  attempts: number; // delivery attempts (revisions)
  engine: string; // llm | rules — which engine verified the delivery
  criteria: number;
  onTime: boolean;
}

export interface MoneyEventRow {
  id: string;
  orderId: string;
  kind: string; // capture | payout | refund | fee
  amount: number;
  currency: string;
  at: string;
  method: string; // PayPal Orders v2 | Payouts v1 | Payments v1
}

export interface AgentRunRow {
  id: string;
  orderId: string;
  agent: string; // contract | verify | mediate
  engine: string; // llm | rules
  outcome: string;
  latencyMs: number;
  at: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  SE: "Sweden",
  CA: "Canada",
  AU: "Australia",
  SG: "Singapore",
  JP: "Japan",
  AE: "United Arab Emirates",
  ID: "Indonesia",
};

export const STAGE_LABEL: Record<Status, string> = {
  request: "Requested",
  awaiting_payment: "Awaiting funding",
  in_escrow: "In escrow",
  verifying: "Verifying",
  revision: "Revision requested",
  review: "Client review",
  paid: "Released",
  declined: "Declined",
};

/** Fee model used in the demo: Lunas 3% + PayPal processing, rounded to cents. */
function fees(amount: number) {
  const fee = Math.round((amount * 0.03 + amount * 0.034 + 0.3) * 100) / 100;
  return { fee, net: Math.round((amount - fee) * 100) / 100 };
}

/** Days between two yyyy-mm-dd dates. */
function daysBetween(a: string, b: string) {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

function fromOrder(o: Order): OrderRow {
  const { fee, net } = fees(o.amount);
  const released = o.status === "paid" ? o.due : "";
  return {
    id: o.id,
    title: o.title,
    client: o.client.name,
    clientCity: o.client.city,
    country: o.client.country,
    countryName: COUNTRY_NAMES[o.client.country] ?? o.client.country,
    direction: o.direction === "from_client" ? "From client" : "To client",
    product: o.product,
    status: o.status,
    stage: STAGE_LABEL[o.status],
    amount: o.amount,
    fee,
    net,
    currency: o.currency,
    createdAt: o.created,
    dueAt: o.due,
    releasedAt: released,
    daysToPay: released ? daysBetween(o.created, released) : 0,
    attempts: o.status === "revision" ? 2 : 1,
    engine: "llm",
    criteria: o.criteria.length,
    onTime: o.status === "paid",
  };
}

/** Six months of history, seeded by hand so the numbers are stable and familiar. */
const HISTORY: Array<[string, string, string, string, string, string, number, Status, number, string, number]> = [
  // id, created, released, client, city, country, amount, status, attempts, engine, daysToPay
  ["LNS-0041", "2026-05-04", "2026-05-09", "Marta Klein", "Berlin", "DE", 240, "paid", 1, "llm", 5],
  ["LNS-0042", "2026-05-12", "2026-05-18", "Tom Becker", "Hamburg", "DE", 180, "paid", 2, "llm", 6],
  ["LNS-0043", "2026-05-21", "2026-05-26", "Aisha Rahman", "Dubai", "AE", 320, "paid", 1, "llm", 5],
  ["LNS-0044", "2026-06-02", "2026-06-10", "Grace Tan", "Singapore", "SG", 145, "paid", 1, "rules", 8],
  ["LNS-0045", "2026-06-11", "2026-06-15", "Liam O'Connor", "Dublin", "IE", 275, "paid", 1, "llm", 4],
  ["LNS-0046", "2026-06-24", "2026-07-01", "Sofia Rossi", "Milan", "IT", 410, "paid", 2, "llm", 7],
  ["LNS-0047", "2026-07-03", "2026-07-07", "James Miller", "Austin", "US", 150, "paid", 1, "llm", 4],
  ["LNS-0048", "2026-07-15", "2026-07-22", "Noor Haddad", "Amman", "JO", 190, "paid", 1, "llm", 7],
  ["LNS-0049", "2026-07-28", "2026-08-03", "Erik Lund", "Stockholm", "SE", 530, "paid", 3, "llm", 6],
  ["LNS-0050", "2026-08-06", "2026-08-11", "Priya Nair", "Bengaluru", "IN", 220, "paid", 1, "llm", 5],
  ["LNS-0051", "2026-08-19", "2026-08-27", "Chloe Dubois", "Lyon", "FR", 365, "paid", 2, "llm", 8],
  ["LNS-0052", "2026-09-08", "2026-09-15", "Yuki Tanaka", "Osaka", "JP", 480, "paid", 1, "llm", 7],
  ["LNS-0053", "2026-09-17", "", "Marco Bianchi", "Rome", "IT", 260, "review", 1, "llm", 0],
  ["LNS-0054", "2026-09-25", "", "Hannah Weber", "Vienna", "AT", 175, "refunded" as Status, 2, "llm", 0],
];

const COUNTRY_BY_CITY: Record<string, string> = {
  Berlin: "DE", Hamburg: "DE", Dubai: "AE", Singapore: "SG", Dublin: "IE", Milan: "IT",
  Austin: "US", Amman: "JO", Stockholm: "SE", Bengaluru: "IN", Lyon: "FR", Osaka: "JP",
  Rome: "IT", Vienna: "AT",
};

export const ORDER_ROWS: OrderRow[] = [
  ...ORDERS.map(fromOrder),
  ...HISTORY.map(([id, created, released, client, city, country, amount, status, attempts, engine, daysToPay]) => {
    const { fee, net } = fees(amount);
    const cc = COUNTRY_BY_CITY[city] ?? country;
    return {
      id,
      title: "Product photo editing",
      client,
      clientCity: city,
      country: cc,
      countryName: COUNTRY_NAMES[cc] ?? cc,
      direction: "From client",
      product: "bottle",
      status,
      stage: STAGE_LABEL[status] ?? String(status),
      amount,
      fee,
      net,
      currency: "USD",
      createdAt: created,
      dueAt: released || created,
      releasedAt: released,
      daysToPay,
      attempts,
      engine,
      criteria: 4,
      onTime: daysToPay > 0 && daysToPay <= 10,
    } satisfies OrderRow;
  }),
];

/** Money events behind the orders: funding, release, fees, one refund. */
export const MONEY_EVENT_ROWS: MoneyEventRow[] = ORDER_ROWS.flatMap((o) => {
  const events: MoneyEventRow[] = [];
  if (o.status !== "request" && o.status !== "declined" && o.status !== "awaiting_payment") {
    events.push({
      id: `${o.id}-C`, orderId: o.id, kind: "Capture", amount: o.amount, currency: o.currency,
      at: o.createdAt, method: "Orders v2",
    });
    events.push({
      id: `${o.id}-F`, orderId: o.id, kind: "Fee", amount: -o.fee, currency: o.currency,
      at: o.releasedAt || o.createdAt, method: "Orders v2",
    });
  }
  if (o.status === "paid") {
    events.push({
      id: `${o.id}-P`, orderId: o.id, kind: "Payout", amount: o.net, currency: o.currency,
      at: o.releasedAt, method: "Payouts v1",
    });
  }
  if (String(o.status) === "refunded") {
    events.push({
      id: `${o.id}-R`, orderId: o.id, kind: "Refund", amount: -o.amount, currency: o.currency,
      at: o.dueAt, method: "Payments v1",
    });
  }
  return events;
});

/** One row per agent call. Latency is deterministic, derived from the row it processed. */
export const AGENT_RUN_ROWS: AgentRunRow[] = ORDER_ROWS.flatMap((o, i) => {
  const runs: AgentRunRow[] = [
    {
      id: `${o.id}-contract`, orderId: o.id, agent: "Contract", engine: "llm",
      outcome: `${o.criteria} criteria`, latencyMs: 620 + ((i * 37) % 480), at: o.createdAt,
    },
  ];
  if (o.attempts > 0 && o.status !== "request") {
    for (let a = 1; a <= o.attempts; a++) {
      runs.push({
        id: `${o.id}-verify-${a}`, orderId: o.id, agent: "Verify", engine: o.engine,
        outcome: a < o.attempts ? "Revision requested" : "All criteria met",
        latencyMs: 380 + ((i * 53 + a * 17) % 520), at: o.createdAt,
      });
    }
  }
  if (String(o.status) === "refunded") {
    runs.push({
      id: `${o.id}-mediate`, orderId: o.id, agent: "Mediate", engine: "llm",
      outcome: "Partial refund 100%", latencyMs: 940 + (i % 300), at: o.dueAt,
    });
  }
  return runs;
});

/* ---------- headline numbers for the page header ---------- */

export interface Kpis {
  inEscrow: number;
  releasedTotal: number;
  avgDaysToPay: number;
  payRate: number; // share of orders that reached payout
  countries: number;
  aiChecked: number; // share verified by the LLM engine
}

export function kpis(): Kpis {
  const paid = ORDER_ROWS.filter((o) => o.status === "paid");
  const releasedTotal = paid.reduce((s, o) => s + o.net, 0);
  const avgDaysToPay = paid.length ? paid.reduce((s, o) => s + o.daysToPay, 0) / paid.length : 0;
  const open = ORDER_ROWS.filter((o) => o.status === "in_escrow" || o.status === "verifying" || o.status === "review");
  const inEscrow = open.reduce((s, o) => s + o.amount, 0);
  const finished = ORDER_ROWS.filter((o) => o.status === "paid" || String(o.status) === "refunded").length;
  const llmRuns = AGENT_RUN_ROWS.filter((r) => r.engine === "llm").length;
  return {
    inEscrow,
    releasedTotal,
    avgDaysToPay,
    payRate: finished ? paid.length / finished : 0,
    countries: new Set(ORDER_ROWS.map((o) => o.country)).size,
    aiChecked: AGENT_RUN_ROWS.length ? llmRuns / AGENT_RUN_ROWS.length : 0,
  };
}

/** The three tables AG Studio gets. Names/descriptions are read by the AI assistant too. */
export function studioSources() {
  return [
    {
      id: "orders",
      name: "Orders",
      description:
        "Every escrow order: client, country, amount, escrow stage, delivery attempts, which engine verified it, and how long payment took.",
      data: ORDER_ROWS as unknown as Record<string, unknown>[],
    },
    {
      id: "money_events",
      name: "Money events",
      description:
        "Each PayPal movement behind an order — capture into escrow, payout to the freelancer, Lunas fee, refund — with the API that produced it.",
      data: MONEY_EVENT_ROWS as unknown as Record<string, unknown>[],
    },
    {
      id: "agent_runs",
      name: "Agent runs",
      description:
        "One row per AI agent call: contract drafting, delivery verification, dispute mediation, the engine used and the latency.",
      data: AGENT_RUN_ROWS as unknown as Record<string, unknown>[],
    },
  ];
}

export const INSIGHT_SOURCES = studioSources();
