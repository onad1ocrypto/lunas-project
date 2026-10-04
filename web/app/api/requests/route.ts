import { NextResponse } from "next/server";

/**
 * Incoming order requests — the pipe from a client's public page (/to/<handle>)
 * into the freelancer's dashboard.
 *
 * Storage is Supabase **Storage** (a JSON object per request), not a table: it
 * needs no schema migration, so the pipe works on a fresh project with nothing
 * but the two server-side env vars the profile store already uses. The bucket
 * is created on first write. When the env vars are absent the route answers
 * `stored: "local"` and the browser keeps the request in localStorage instead,
 * so the demo never dies — it just stops being cross-device.
 *
 *   POST   { handle, name, email, brief, title?, budget, criteria[] }  → { ok, id, stored }
 *   GET    ?handle=<handle>  → { requests: [...] }        (inbox, newest first)
 *   GET    ?id=<REQ-…>       → { request: {...} }         (open one by id)
 *   PATCH  { id, status }    → { ok }                     (accepted / declined)
 */

const url = () =>
  (process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "");
const key = () => (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
const enabled = () => Boolean(url() && key());

const BUCKET = "requests";
let bucketReady = false;

function authHeaders(extra: Record<string, string> = {}) {
  return { apikey: key(), Authorization: `Bearer ${key()}`, ...extra };
}

async function ensureBucket(): Promise<boolean> {
  if (!enabled()) return false;
  if (bucketReady) return true;
  const r = await fetch(`${url()}/storage/v1/bucket`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
    cache: "no-store",
  });
  // 200 = created, 400/409 = someone (or a previous call) already made it
  bucketReady = r.ok || r.status === 400 || r.status === 409;
  return bucketReady;
}

const objectUrl = (path: string) => `${url()}/storage/v1/object/${BUCKET}/${path}`;

async function put(path: string, body: unknown): Promise<boolean> {
  if (!(await ensureBucket())) return false;
  const r = await fetch(objectUrl(path), {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json", "x-upsert": "true" }),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return r.ok;
}

async function read(path: string): Promise<IncomingRequest | null> {
  if (!enabled()) return null;
  const r = await fetch(objectUrl(path), { headers: authHeaders(), cache: "no-store" });
  if (!r.ok) return null;
  try {
    return (await r.json()) as IncomingRequest;
  } catch {
    return null;
  }
}

/** Newest first, capped — the demo inbox never needs more than this. */
async function listAll(handle: string, limit = 40): Promise<IncomingRequest[]> {
  if (!(await ensureBucket())) return [];
  const r = await fetch(`${url()}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ prefix: "", limit: Math.min(200, limit * 2), offset: 0, sortBy: { column: "created_at", order: "desc" } }),
    cache: "no-store",
  });
  if (!r.ok) return [];
  const rows = (await r.json()) as { name?: string }[];
  const out: IncomingRequest[] = [];
  for (const row of Array.isArray(rows) ? rows.slice(0, limit * 2) : []) {
    const name = String(row?.name ?? "");
    if (!name.endsWith(".json")) continue;
    const obj = await read(name);
    if (obj?.id && obj.handle === handle) out.push(obj);
  }
  return out.slice(0, limit).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * One flat namespace: every request is `<REQ-id>.json` at the bucket root and
 * carries its own handle. Nothing has to be searched, so an id is always
 * readable directly, and an inbox is just a filter over the root listing.
 */
const pathOf = (id: string) => `${id}.json`;

const idOk = (id: string) => /^REQ-[A-Z0-9]{4,12}$/.test(id);

async function findById(id: string): Promise<IncomingRequest | null> {
  if (!enabled() || !idOk(id)) return null;
  return read(pathOf(id));
}

interface IncomingRequest {
  id: string;
  handle: string;
  name: string;
  email: string;
  brief: string;
  title?: string;
  budget: number;
  criteria: { label: string; rule: string; icon: string }[];
  createdAt: string;
  status?: "new" | "accepted" | "declined";
}

const clean = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const handleOk = (h: string) => /^[a-z0-9][a-z0-9-]{1,31}$/.test(h);

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const handle = clean(b.handle, 32).toLowerCase();
  const name = clean(b.name, 80);
  const email = clean(b.email, 120);
  const brief = String(b.brief ?? "").trim().slice(0, 1200);
  const title = clean(b.title, 90) || undefined;
  const budget = Math.max(0, Math.min(1_000_000, Number(b.budget) || 0));
  const criteria = (Array.isArray(b.criteria) ? b.criteria : []).slice(0, 8).map((c) => {
    const o = c as Record<string, unknown>;
    return { label: clean(o.label, 90) || "criterion", rule: clean(o.rule, 200), icon: clean(o.icon, 12) || "file" };
  });

  if (!handleOk(handle)) return NextResponse.json({ error: "bad handle" }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: "name too short" }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "bad email" }, { status: 400 });
  if (brief.length < 15) return NextResponse.json({ error: "brief too short" }, { status: 400 });
  if (!criteria.length) return NextResponse.json({ error: "no criteria yet — draft the contract first" }, { status: 400 });

  const id = `REQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const request: IncomingRequest = {
    id, handle, name, email, brief, title, budget, criteria,
    createdAt: new Date().toISOString(),
    status: "new",
  };

  const stored = await put(pathOf(id), request);
  return NextResponse.json({ ok: true, id, stored: stored ? "server" : "local" }, { headers: { "cache-control": "no-store" } });
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = clean(q.get("id"), 24);
  if (id) {
    const request = await findById(id.toUpperCase());
    return NextResponse.json({ request }, { headers: { "cache-control": "no-store" } });
  }
  const handle = clean(q.get("handle"), 32).toLowerCase();
  if (!handleOk(handle)) return NextResponse.json({ error: "bad handle" }, { status: 400 });
  const requests = await listAll(handle);
  return NextResponse.json({ requests }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  const id = clean(b.id, 24).toUpperCase();
  const status = b.status === "accepted" || b.status === "declined" ? b.status : null;
  if (!idOk(id) || !status)
    return NextResponse.json({ error: "need a request id and a status" }, { status: 400 });
  const found = await findById(id);
  if (!found) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const ok = await put(pathOf(found.id), { ...found, status });
  return NextResponse.json({ ok }, { headers: { "cache-control": "no-store" } });
}
