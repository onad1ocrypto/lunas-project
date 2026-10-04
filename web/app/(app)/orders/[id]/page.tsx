"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getOrder, ORDERS, type Order, type ProductKind, type Status } from "@/lib/data";
import { api } from "@/lib/api";
import { MoneyRail } from "@/components/MoneyRail";
import { Capi } from "@/components/Capi";
import { Icon } from "@/components/Icon";
import { CriteriaList } from "@/components/DraftContract";
import { Avatar, Confetti, Country, Product, StatusBadge, Toast } from "@/components/ui";

type Log = { who: string; msg: string; res?: string; kind: "ai" | "pp" | "hook" | "err" };

/** cancel-safe sleep for click-triggered sequences */
function useSleep() {
  const token = useRef(0);
  useEffect(() => () => { token.current++; }, []);
  return (ms: number) => {
    const t = token.current;
    return new Promise<void>((res, rej) => setTimeout(() => (t === token.current ? res() : rej(new Error("cancelled"))), ms));
  };
}

const TIMELINE: Status[][] = [["request"], ["awaiting_payment"], ["in_escrow"], ["verifying", "revision", "review"], ["paid"]];

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const order = getOrder(id) ?? ORDERS[0];
  const { t, money, date } = useI18n();
  const [status, setStatus] = useState<Status>(order.status);
  const [logs, setLogs] = useState<Log[]>(() => seedLogs(order));
  const [fire, setFire] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  /** Real ids returned by PayPal — shown on the receipt so nothing in the demo is invented. */
  const [pp, setPp] = useState<{ captureId?: string; paypalOrderId?: string; payoutBatchId?: string }>({});

  const log = (l: Log) => setLogs((x) => [...x, l]);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const stageIdx = TIMELINE.findIndex((g) => g.includes(status));
  const tl = [t("tl.agree"), t("tl.fund"), t("tl.work"), t("tl.verify"), t("tl.lunas")];

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* header */}
      <div>
        <Link href={`/orders?tab=${order.direction}`} className="btn sm ghost" style={{ marginLeft: -10 }}><Icon name="left" size={15} /> {t("nav.orders")}</Link>
        <div className="row between wrap" style={{ gap: 14, marginTop: 6 }}>
          <div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="mono tiny" style={{ fontWeight: 800 }}>{order.id}</span>
              <span className="badge" style={{ background: order.direction === "from_client" ? "var(--pink-l)" : "var(--sky-l)" }}>
                <Icon name={order.direction === "from_client" ? "inbox" : "send"} size={13} />
                {order.direction === "from_client" ? t("orders.tab.from") : t("orders.tab.to")}
              </span>
              <StatusBadge s={status} />
            </div>
            <h1 style={{ fontSize: "clamp(26px,3vw,36px)", marginTop: 8 }}>{order.title}</h1>
          </div>
          <div className="col" style={{ alignItems: "flex-end" }}>
            <div className="display" style={{ fontSize: 36 }}>{money(order.amount)}</div>
            <div className="tiny muted row" style={{ gap: 4 }}><Icon name="clock" size={13} /> {t("order.due", { date: date(order.due, { day: "numeric", month: "long" }) })}</div>
          </div>
        </div>
      </div>

      <MoneyRail order={order} status={status} />

      {/* timeline */}
      {status !== "declined" && (
        <div className="tl">
          {tl.map((label, i) => (
            <div key={label} className={`tl-step ${i < stageIdx ? "done" : i === stageIdx ? "now" : ""}`}>
              <span className="tl-dot">{i < stageIdx ? <Icon name="check" size={14} stroke={3} /> : i + 1}</span>
              <span className="tl-label">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="od-grid">
        <div className="col" style={{ gap: 20 }}>
          {status === "request" && (
            <RequestPanel order={order}
              onAccept={() => { setStatus("awaiting_payment"); log({ who: "contract", msg: "accepted by Sari", res: "payment link sent to client", kind: "hook" }); flash(t("toast.accepted")); }}
              onDecline={() => { setStatus("declined"); log({ who: "contract", msg: "declined", kind: "err" }); }} />
          )}
          {status === "awaiting_payment" && (
            <PaymentPanel order={order} log={log} onPaid={(info) => { setStatus("in_escrow"); setPp((p) => ({ ...p, ...info })); flash(t("toast.funded")); }} />
          )}
          {(status === "in_escrow" || status === "verifying" || status === "revision") && (
            <DeliveryPanel order={order} status={status} setStatus={setStatus} log={log} />
          )}
          {status === "review" && (
            <ReviewPanel order={order} log={log}
              onApproved={(info) => { setStatus("paid"); setJustPaid(true); setPp((p) => ({ ...p, ...info })); setFire((f) => f + 1); }}
              onRefunded={() => { setStatus("refunded"); flash("Client refunded via PayPal"); }} />
          )}
          {status === "paid" && <PaidPanel order={order} slam={justPaid} payoutBatchId={pp.payoutBatchId} />}
          {status === "refunded" && (
            <div className="card pad rise" style={{ background: "var(--peach-l)" }}>
              <PanelHead color="var(--peach)" icon="shield" title="Refunded — dispute resolved" sub="The Mediator Agent returned the client's money through the PayPal refund API. Escrow is empty, nobody lost trust." />
              <div className="row wrap" style={{ gap: 10 }}>
                <span className="badge" style={{ background: "var(--paper)" }}>Payments v1 · refund</span>
                <span className="badge" style={{ background: "var(--paper)" }}>no chargeback</span>
              </div>
            </div>
          )}
          {status === "declined" && (
            <div className="card pad col" style={{ alignItems: "center", gap: 10, textAlign: "center" }}>
              <Capi size={90} mood="think" />
              <h3 style={{ fontSize: 22 }}>{t("decl.t")}</h3>
              <p className="muted">{t("decl.b")}</p>
              <button className="btn sm" onClick={() => setStatus("request")}><Icon name="refresh" size={15} /> {t("decl.undo")}</button>
            </div>
          )}

          {/* the brief */}
          <div className="card pad">
            <div className="row" style={{ gap: 12, marginBottom: 12 }}>
              <Avatar p={order.client} size={42} />
              <div>
                <div style={{ fontWeight: 800 }}>{order.client.name}</div>
                <div className="row tiny muted" style={{ gap: 5 }}>{order.client.city} <Country code={order.client.country} /> · {t("od.briefFrom")}</div>
              </div>
            </div>
            <div className="bubble">{order.brief}</div>
          </div>
        </div>

        <div className="col" style={{ gap: 20 }}>
          <div className="card pad">
            <CriteriaList criteria={order.criteria} />
            <div className="row between tiny" style={{ marginTop: 14, fontWeight: 700 }}>
              <span className="muted">{t("od.window")}</span><span>72 {t("new.hours")} → {t("od.auto")}</span>
            </div>
          </div>
          <AgentLog logs={logs} />
        </div>
      </div>

      <Confetti fire={fire} />
      <Toast show={!!toast}><Icon name="check" size={18} /> <b>{toast}</b></Toast>

      <style>{`
        .tl{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
        .tl-step{display:flex;align-items:center;gap:8px;padding:10px 12px;border:2.5px solid var(--ink);border-radius:14px;background:var(--paper);font-weight:800;font-size:13.5px;opacity:.55;transition:.3s var(--spring)}
        .tl-step.done{opacity:1;background:var(--mint-l)}
        .tl-step.now{opacity:1;background:var(--lemon);box-shadow:3px 3px 0 var(--ink);transform:translateY(-2px)}
        .tl-dot{width:26px;height:26px;border-radius:50%;border:2px solid var(--ink);display:grid;place-items:center;background:var(--paper);font-size:12px;flex:none}
        .tl-step.done .tl-dot{background:var(--green);color:#fff}
        .tl-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .od-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:20px;align-items:start}
        .bubble{background:var(--cream);border:2.5px solid var(--ink);border-radius:4px 18px 18px 18px;padding:14px 16px;line-height:1.6}
        @media (max-width:1100px){.od-grid{grid-template-columns:1fr}}
        @media (max-width:700px){.tl{grid-template-columns:repeat(5,auto);overflow-x:auto}.tl-label{display:none}}
      `}</style>
    </div>
  );
}

/* ================= Panels ================= */

function PanelHead({ color, icon, title, sub }: { color: string; icon: string; title: string; sub: string }) {
  return (
    <div className="row" style={{ gap: 12, marginBottom: 16, alignItems: "flex-start" }}>
      <span style={{ flex: "none", width: 44, height: 44, borderRadius: 13, border: "2.5px solid var(--ink)", background: color, display: "grid", placeItems: "center", boxShadow: "2px 2px 0 var(--ink)" }}>
        <Icon name={icon} size={22} />
      </span>
      <div>
        <h2 style={{ fontSize: 22 }}>{title}</h2>
        <p className="muted" style={{ marginTop: 2, fontSize: 14.5 }}>{sub}</p>
      </div>
    </div>
  );
}

function RequestPanel({ order, onAccept, onDecline }: { order: Order; onAccept: () => void; onDecline: () => void }) {
  const { t, money } = useI18n();
  return (
    <div className="card pad rise" style={{ background: "var(--pink-l)" }}>
      <PanelHead color="var(--pink)" icon="inbox" title={t("req.t", { name: order.client.name.split(" ")[0] })} sub={t("req.b")} />
      <div className="row wrap" style={{ gap: 10 }}>
        <button className="btn mint lg" onClick={onAccept}><Icon name="check" size={18} /> {t("req.accept", { amount: money(order.amount) })}</button>
        <button className="btn">{t("req.counter")}</button>
        <button className="btn ghost" onClick={onDecline}>{t("req.decline")}</button>
      </div>
    </div>
  );
}

function PaymentPanel({ order, log, onPaid }: { order: Order; log: (l: Log) => void; onPaid: (info?: { captureId?: string; paypalOrderId?: string }) => void }) {
  const { t } = useI18n();
  const sleep = useSleep();
  const [phase, setPhase] = useState<"wait" | "paying" | "sealed">("wait");
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Orders v2 → capture. Two calls, real PayPal when keys are configured, simulator when
   * they are not. Either way the ids that land in the log come from the server.
   */
  const pay = async () => {
    try {
      setError(null);
      setPhase("paying");
      const created = await api.createEscrowPayment(order.id);
      if (!created.ok) {
        log({ who: "paypal", msg: "orders.create", res: `FAILED: ${created.error}`, kind: "err" });
        setError(created.error ?? "PayPal refused the request");
        setPhase("wait");
        return;
      }
      const d = created.data;
      setApprovalUrl(d.approvalUrl ?? null);
      log({
        who: "paypal",
        msg: "orders.create",
        res: `intent: CAPTURE · ${Number(d.amount).toFixed(2)} ${d.currency} · ${d.paypalOrderId}${d.simulated ? " (simulated)" : ""}`,
        kind: "pp",
      });
      await sleep(900);

      const captured = await api.captureEscrowPayment(d.paypalOrderId, order.id);
      if (!captured.ok) {
        log({ who: "paypal", msg: "orders.capture", res: `FAILED: ${captured.error}`, kind: "err" });
        setError(captured.error ?? "Capture failed");
        setPhase("wait");
        return;
      }
      log({ who: "paypal", msg: "orders.capture", res: `status: ${String(captured.data.status ?? "COMPLETED").toUpperCase()} · ${captured.data.captureId ?? "capture id pending"}`, kind: "pp" });
      setPhase("sealed");
      await sleep(1400);
      log({ who: "webhook", msg: "PAYMENT.CAPTURE.COMPLETED", res: `order → IN_ESCROW · ${order.client.name.split(" ")[0]} funded the escrow`, kind: "hook" });
      onPaid({ captureId: captured.data.captureId, paypalOrderId: d.paypalOrderId });
    } catch {
      setPhase("wait");
    }
  };
  return (
    <div className="card pad rise" style={{ background: "var(--lemon-l)" }}>
      <PanelHead color="var(--lemon)" icon="wallet" title={t("pay.t")} sub={t("pay.b", { name: order.client.name.split(" ")[0] })} />
      <div className="pay-grid">
        <div className={`env ${phase === "sealed" ? "sealed" : ""}`} aria-hidden>
          <div className="env-back" />
          <div className={`env-bill ${phase === "sealed" ? "in" : ""}`}>$</div>
          <svg className="env-front" viewBox="0 0 200 130" preserveAspectRatio="none">
            <path d="M1.5 40 L100 92 L198.5 40 V118 a10.5 10.5 0 0 1 -10.5 10.5 H12 a10.5 10.5 0 0 1 -10.5 -10.5 Z" fill="var(--peach-l)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
          <svg className="env-flap" viewBox="0 0 200 80" preserveAspectRatio="none">
            <path d="M3 1.5 H197 L100 78 Z" fill="#FFC9A8" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
          <div className="env-seal">L</div>
        </div>
        <div className="col" style={{ gap: 10 }}>
          <Link href={`/pay/${order.id}`} className="code-link" style={{ background: "var(--paper)", border: "2.5px dashed var(--ink)", borderRadius: 12, padding: "10px 12px", fontWeight: 800, display: "block", wordBreak: "break-all" }}>
            {"</>"} Client checkout · /pay/{order.id}
          </Link>
          <div className="row wrap" style={{ gap: 8 }}>
            <button
              className="btn sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}/pay/${order.id}`);
                } catch {}
              }}
            >
              <Icon name="copy" size={15} /> {t("new.copy")}
            </button>
            <Link className="btn sm" href={`/pay/${order.id}`} target="_blank"><Icon name="eye" size={15} /> {t("pay.remind")}</Link>
            {approvalUrl && phase === "wait" && (
              <a className="btn sm" href={approvalUrl} target="_blank" rel="noreferrer"><Icon name="link" size={15} /> PayPal approval page</a>
            )}
          </div>
          {error && <span className="tiny" style={{ color: "var(--red)" }}>{error}</span>}
          <div className="demo-box">
            <div className="kbd" style={{ marginBottom: 8 }}>{t("demo.label")}</div>
            <button className="btn paypal" disabled={phase !== "wait"} onClick={pay}>
              {phase === "paying" ? <><span className="spin" style={{ width: 16, height: 16, border: "2.5px solid var(--ink)", borderTopColor: "transparent", borderRadius: "50%" }} /> {t("pay.processing")}</>
                : phase === "sealed" ? <><Icon name="check" size={16} /> {t("pay.captured")}</>
                : <>{t("pay.simulate")} <i>Pay<b>Pal</b></i></>}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .pay-grid{display:grid;grid-template-columns:220px 1fr;gap:22px;align-items:center}
        .env{position:relative;width:200px;height:130px;margin:40px auto 10px;perspective:600px}
        .env-back{position:absolute;inset:0;background:var(--peach);border:2.5px solid var(--ink);border-radius:12px}
        .env-bill{position:absolute;left:30px;right:30px;top:-60px;height:70px;background:var(--mint);border:2.5px solid var(--ink);border-radius:8px;display:grid;place-items:center;font-family:var(--font-display);font-size:30px;font-weight:700;z-index:1;transition:transform .9s var(--ease)}
        .env-bill.in{transform:translateY(95px)}
        .env-front{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;overflow:visible}
        .env-flap{position:absolute;left:0;top:0;width:100%;height:80px;transform-origin:top;transform:rotateX(180deg);z-index:0;overflow:visible;transition:transform .7s .8s var(--ease),z-index 0s 1.1s}
        .env.sealed .env-flap{transform:rotateX(0);z-index:3}
        .env-seal{position:absolute;left:50%;top:52px;width:44px;height:44px;margin-left:-22px;border-radius:50%;background:var(--red);border:2.5px solid var(--ink);color:#fff;display:grid;place-items:center;font-family:var(--font-display);font-weight:700;font-size:20px;z-index:4;transform:scale(0)}
        .env.sealed .env-seal{animation:popin .5s 1.4s var(--spring) both;transform:none}
        .demo-box{border:2.5px dashed var(--ink-3);border-radius:16px;padding:12px;background:rgba(255,255,255,.6)}
        @media (max-width:600px){.pay-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}

type Check = "idle" | "run" | "pass" | "fail";
type VerifyRow = { label: string; rule: string; status: "pass" | "fail" | "manual"; evidence: string; engine: string };

/**
 * Delivery panel — real uploads, real verification.
 *
 * Files go to POST /api/orders/:id/deliverables, where the server inspects the bytes
 * (format, dimensions, alpha, DPI, word counts) and runs the Verification Agent. The
 * animation mirrors the actual per-criterion results instead of a script.
 */
function DeliveryPanel({ order, status, setStatus, log }: { order: Order; status: Status; setStatus: (s: Status) => void; log: (l: Log) => void }) {
  const { t } = useI18n();
  const sleep = useSleep();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState(status !== "in_escrow");
  const [names, setNames] = useState<string[]>([]);
  const [checks, setChecks] = useState<Check[]>(() => order.criteria.map(() => (status === "revision" ? "idle" : "idle")));
  const [scan, setScan] = useState(0);
  const [busy, setBusy] = useState(false);
  const [revisionNote, setRevisionNote] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true);
    setError(null);
    setPicked(true);
    setRevisionNote(null);
    setStatus("verifying");
    setScan((s) => s + 1);
    setChecks(order.criteria.map(() => "run"));
    log({
      who: "freelancer",
      msg: "delivery.upload",
      res: `${files.length} file(s) · ${(files.reduce((s, f) => s + f.size, 0) / 1e6).toFixed(1)} MB`,
      kind: "hook",
    });

    const res = await api.submitDelivery(order.id, files);
    if (!res.ok) {
      log({ who: "verify_agent", msg: "delivery.rejected", res: res.error ?? "upload failed", kind: "err" });
      setError(res.error ?? "Upload failed");
      setStatus("in_escrow");
      setChecks(order.criteria.map(() => "idle"));
      setBusy(false);
      return;
    }

    const results: VerifyRow[] = res.data?.verification?.results ?? [];
    setNames(files.map((f) => f.name));
    setSummary(res.data?.verification?.summary ?? null);

    for (let i = 0; i < results.length; i++) {
      await sleep(420);
      const r = results[i];
      setChecks((x) => x.map((v, j) => (j === i ? (r.status === "fail" ? "fail" : "pass") : v)));
      log({
        who: "verify_agent",
        msg: r.rule,
        res: `${r.status === "pass" ? "✓" : r.status === "fail" ? "✕" : "…"} ${r.evidence}`,
        kind: r.status === "fail" ? "err" : r.status === "manual" ? "hook" : "ai",
      });
    }

    await sleep(320);
    const verdict: string = res.data?.verification?.verdict ?? "review";
    log({ who: "verify_agent", msg: "verdict", res: res.data?.verification?.summary ?? verdict, kind: verdict === "revision" ? "err" : "ai" });
    if (verdict === "revision") {
      setRevisionNote(results.find((r) => r.status === "fail")?.evidence ?? "a criterion was not met");
      setStatus("revision");
    } else {
      setStatus("review");
    }
    setBusy(false);
  };

  const sample = async () => {
    setBusy(true);
    log({ who: "demo", msg: "sample_delivery.generate()", res: "rendering files in the browser to match the criteria", kind: "hook" });
    const { buildSampleDelivery } = await import("@/lib/sample");
    const { files, notes } = await buildSampleDelivery(order.criteria);
    setBusy(false);
    await run(files);
  };

  const head = status === "revision" ? { c: "var(--peach)", i: "refresh", t: t("dl.revT"), s: t("dl.revB") }
    : status === "verifying" ? { c: "var(--lav)", i: "bot", t: t("dl.verT"), s: t("dl.verB") }
    : { c: "var(--sky)", i: "upload", t: t("dl.t"), s: t("dl.b") };

  /** Thumbnails: uploaded file names when we have them, decorative placeholders otherwise. */
  const thumbs: { label: string; kind?: ProductKind }[] = names.length
    ? names.slice(0, 8).map((n) => ({ label: n }))
    : DELIVERY_PLACEHOLDERS.slice(0, 8).map((p) => ({ label: p.label, kind: p.kind }));

  return (
    <div className="card pad rise" style={{ background: status === "revision" ? "var(--peach-l)" : status === "verifying" ? "var(--lav-l)" : "var(--sky-l)" }}>
      <PanelHead color={head.c} icon={head.i} title={head.t} sub={head.s} />

      <input
        ref={input}
        type="file"
        multiple
        className="hidden-input"
        onChange={(e) => run(Array.from(e.target.files ?? []))}
      />

      {!picked ? (
        <>
          <button className="drop" onClick={() => input.current?.click()} disabled={busy}>
            <span className="drop-ic float"><Icon name="upload" size={30} /></span>
            <b style={{ fontSize: 17 }}>{t("dl.drop")}</b>
            <span className="tiny muted">{t("dl.dropSub")}</span>
          </button>
          <div className="row wrap" style={{ gap: 10, marginTop: 12, justifyContent: "center" }}>
            <button className="btn sm ghost" onClick={sample} disabled={busy}>
              <Icon name="sparkles" size={15} /> No files handy? Generate a sample delivery
            </button>
          </div>
          <p className="tiny muted" style={{ textAlign: "center", marginTop: 8 }}>
            Real files only — the agent reads the bytes it receives, and anything it cannot prove is flagged for review.
          </p>
        </>
      ) : (
        <div className="dl-grid">
          <div style={{ position: "relative" }}>
            {scan > 0 && busy && <div key={scan} className="scanline" />}
            <div className="thumbs stagger">
              {thumbs.map(({ label, kind }, i) => {
                const c = checks[Math.min(i, checks.length - 1)] ?? "idle";
                const bad = c === "fail";
                const ok = checks.length > 0 && checks.every((x) => x === "pass");
                return (
                  <div key={label + i} className={`thumb ${bad ? "bad" : ""}`}>
                    {kind ? (
                      <Product kind={kind} bg="#fff" />
                    ) : (
                      <span className="thumb-file"><Icon name={label.toLowerCase().endsWith(".txt") ? "file" : "image"} size={26} /></span>
                    )}
                    <span className="thumb-name" title={label}>{label.length > 16 ? `${label.slice(0, 14)}…` : label}</span>
                    {(bad || ok) && <span className="thumb-badge" style={{ background: bad ? "var(--red)" : "var(--green)" }}>{bad ? "!" : "✓"}</span>}
                  </div>
                );
              })}
              {names.length > 8 && <div className="thumb more">+{names.length - 8}</div>}
            </div>

            <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn sm" disabled={busy} onClick={() => input.current?.click()}>
                <Icon name="upload" size={15} /> {status === "revision" ? t("dl.reupload") : "Upload a new delivery"}
              </button>
              {status === "in_escrow" && (
                <button className="btn sm ghost" disabled={busy} onClick={sample}>
                  <Icon name="sparkles" size={15} /> Generate sample
                </button>
              )}
            </div>
            {error && <p className="tiny" style={{ color: "var(--red)", marginTop: 8 }}>{error}</p>}
          </div>

          <div className="col" style={{ gap: 8 }}>
            {order.criteria.map((c, i) => (
              <div key={c.label} className={`chk ${checks[i] ?? "idle"}`}>
                <span className="chk-st">{checks[i] === "pass" ? "✓" : checks[i] === "fail" ? "✕" : ""}</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</span>
              </div>
            ))}

            {busy && <div className="tiny muted">Running the acceptance test…</div>}

            {summary && !busy && (
              <div className="tiny" style={{ fontWeight: 700 }}>
                <Icon name="bot" size={14} /> {summary}
              </div>
            )}

            {status === "revision" && (
              <div className="note pop-in">
                <b className="row" style={{ gap: 6 }}><Capi size={30} motion="none" mood="think" /> {t("dl.agentSays")}</b>
                <p style={{ margin: "6px 0 10px", fontSize: 14 }}>{revisionNote ?? t("dl.agentMsg")}</p>
                <button className="btn sm peach" style={{ background: "var(--peach)" }} disabled={busy} onClick={() => input.current?.click()}>
                  <Icon name="upload" size={15} /> {t("dl.reupload")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .hidden-input{display:none}
        .drop{width:100%;border:3px dashed var(--ink);border-radius:20px;padding:34px 20px;background:rgba(255,255,255,.7);display:flex;flex-direction:column;align-items:center;gap:8px;transition:.2s}
        .drop:hover{background:#fff;transform:scale(1.01)}
        .drop-ic{width:62px;height:62px;border-radius:18px;border:2.5px solid var(--ink);background:var(--sky);display:grid;place-items:center;box-shadow:3px 3px 0 var(--ink)}
        .dl-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:18px}
        .thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .thumb{aspect-ratio:1;border:2.5px solid var(--ink);border-radius:14px;overflow:hidden;position:relative;background:#fff;display:grid;place-items:center}
        .thumb.bad{box-shadow:0 0 0 3px var(--red);animation:shake .45s}
        .thumb.more{display:grid;place-items:center;font-weight:900;border-style:dashed;background:transparent}
        .thumb-file{display:grid;place-items:center;color:var(--ink-2)}
        .thumb-name{position:absolute;left:5px;bottom:3px;font-size:9.5px;font-weight:800;color:var(--ink-2);max-width:92%}
        .thumb-badge{position:absolute;top:5px;right:5px;width:20px;height:20px;border-radius:50%;border:2px solid var(--ink);color:#fff;font-size:11px;font-weight:900;display:grid;place-items:center;animation:popin .35s var(--spring)}
        .chk{display:flex;align-items:center;gap:10px;padding:10px 12px;border:2.5px solid var(--ink);border-radius:14px;background:var(--paper);transition:background .3s}
        .chk-st{width:24px;height:24px;border-radius:50%;border:2.5px solid var(--ink-3);display:grid;place-items:center;color:#fff;font-size:12px;font-weight:900;flex:none}
        .chk.run .chk-st{border-color:var(--ink-3);border-top-color:var(--ink);animation:spin .7s linear infinite}
        .chk.pass{background:var(--mint-l)} .chk.pass .chk-st{background:var(--green);border-color:var(--ink);animation:popin .35s var(--spring)}
        .chk.fail{background:var(--red-l)} .chk.fail .chk-st{background:var(--red);border-color:var(--ink);animation:popin .35s var(--spring)}
        .note{background:var(--paper);border:2.5px solid var(--ink);border-left-width:8px;border-left-color:var(--peach);border-radius:14px;padding:12px}
        @media (max-width:640px){.dl-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}

const DELIVERY_PLACEHOLDERS: { kind: ProductKind; label: string }[] = [
  { kind: "bottle", label: "IMG_001" }, { kind: "mug", label: "IMG_004" }, { kind: "shoe", label: "IMG_007" },
  { kind: "bag", label: "IMG_009" }, { kind: "candle", label: "IMG_011" }, { kind: "watch", label: "IMG_014" },
  { kind: "plant", label: "IMG_016" }, { kind: "cap", label: "IMG_019" },
];

function ReviewPanel({ order, log, onApproved, onRefunded }: { order: Order; log: (l: Log) => void; onApproved: (info?: { payoutBatchId?: string }) => void; onRefunded: () => void }) {
  const { t } = useI18n();
  const sleep = useSleep();
  const TOTAL = 72 * 3600;
  const [left, setLeft] = useState(TOTAL - 3 * 3600 - 52 * 60);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000); return () => clearInterval(id); }, []);
  const hh = String(Math.floor(left / 3600)).padStart(2, "0"), mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  const C = 2 * Math.PI * 64;

  /** Client approves → Payouts v1 releases the escrow to the freelancer. */
  const approve = async () => {
    try {
      setBusy(true);
      log({ who: "release_policy", msg: "client_approved()", res: `${order.client.name.split(" ")[0]} · ${hh}h left in the window`, kind: "ai" });
      const res = await api.release(order.id, "client");
      if (!res.ok) {
        log({ who: "paypal", msg: "payouts.create", res: `FAILED: ${res.error}`, kind: "err" });
        setBusy(false);
        return;
      }
      log({ who: "paypal", msg: "payouts.create", res: `batch ${res.data.payoutBatchId} · ${order.amount.toFixed(2)} ${order.currency}`, kind: "pp" });
      await sleep(700);
      log({ who: "webhook", msg: "PAYMENT.PAYOUTSBATCH.SUCCESS", res: `${order.id} → LUNAS ✓`, kind: "hook" });
      onApproved({ payoutBatchId: res.data.payoutBatchId });
    } catch {
      setBusy(false);
    }
  };

  /** Mediator branch: verification failed and the client wants the money back. */
  const refund = async () => {
    setBusy(true);
    log({ who: "mediator", msg: "open_dispute()", res: "client contests the delivery", kind: "ai" });
    const res = await api.refund(order.id, "delivery did not meet the agreed criteria");
    if (!res.ok) {
      log({ who: "paypal", msg: "payments.refund", res: `FAILED: ${res.error}`, kind: "err" });
      setBusy(false);
      return;
    }
    log({ who: "paypal", msg: "payments.refund", res: `${res.data.refund?.status ?? "COMPLETED"} · ${res.data.refund?.id ?? ""}`, kind: "pp" });
    onRefunded();
  };

  /** Same policy the server runs on a schedule: if the window elapsed, release. */
  const autoRelease = async () => {
    setBusy(true);
    log({ who: "release_policy", msg: "review_window_check()", res: `72h window · started ${new Date().toISOString().slice(0, 10)}`, kind: "ai" });
    const res = await api.release(order.id, "auto");
    if (!res.ok) {
      log({ who: "release_policy", msg: "hold()", res: `FAILED: ${res.error}`, kind: "err" });
      setBusy(false);
      return;
    }
    if (!res.data.released) {
      log({ who: "release_policy", msg: "hold()", res: res.data.reason ?? "window still open", kind: "hook" });
      setBusy(false);
      return;
    }
    log({ who: "paypal", msg: "payouts.create (auto-release)", res: `batch ${res.data.payoutBatchId}`, kind: "pp" });
    onApproved({ payoutBatchId: res.data.payoutBatchId });
  };

  return (
    <div className="card pad rise" style={{ background: "var(--lav-l)" }}>
      <PanelHead color="var(--lav)" icon="clock" title={t("rev.t")} sub={t("rev.b", { name: order.client.name.split(" ")[0] })} />
      <div className="row wrap" style={{ gap: 26, justifyContent: "center" }}>
        <div style={{ position: "relative", width: 160, height: 160 }}>
          <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="80" cy="80" r="64" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2.5" />
            <circle cx="80" cy="80" r="64" fill="none" stroke="var(--lav)" strokeWidth="14" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - left / TOTAL)} style={{ transition: "stroke-dashoffset 1s linear" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", alignContent: "center", textAlign: "center" }}>
            <b className="mono" style={{ fontSize: 22 }}>{hh}:{mm}:{ss}</b>
            <span className="tiny muted" style={{ fontWeight: 700 }}>{t("rev.until")}</span>
          </div>
        </div>
        <div className="col" style={{ gap: 10, maxWidth: 300 }}>
          <div className="row" style={{ gap: 8, fontWeight: 800 }}><Icon name="shield" size={18} /> {t("rev.safe")}</div>
          <p className="muted tiny" style={{ fontSize: 14 }}>{t("rev.explain")}</p>
          <div className="demo-box2">
            <div className="kbd" style={{ marginBottom: 8 }}>{t("demo.label")}</div>
            <div className="col" style={{ gap: 8 }}>
              <button className="btn mint" disabled={busy} onClick={approve}><Icon name="check" size={17} /> {busy ? t("rev.releasing") : t("rev.simulate")}</button>
              <button className="btn sm ghost" disabled={busy} onClick={autoRelease}><Icon name="clock" size={15} /> Run the release policy (72h check)</button>
              <button className="btn sm ghost" disabled={busy} onClick={refund}><Icon name="shield" size={15} /> Mediator: refund the client</button>
            </div>
          </div>
        </div>
      </div>
      <style>{`.demo-box2{border:2.5px dashed var(--ink-3);border-radius:16px;padding:12px;background:rgba(255,255,255,.6)}`}</style>
    </div>
  );
}

function PaidPanel({ order, slam, payoutBatchId }: { order: Order; slam: boolean; payoutBatchId?: string }) {
  const { t, money } = useI18n();
  return (
    <div className="card pad rise" style={{ background: "var(--mint-l)" }}>
      <PanelHead color="var(--mint)" icon="heart" title={t("paid.t")} sub={t("paid.b", { amount: money(order.amount) })} />
      <div className="row wrap" style={{ gap: 20, justifyContent: "center", alignItems: "flex-end" }}>
        <div className={`card receipt ${slam ? "shake" : ""}`} style={{ animationDelay: ".25s" }}>
          <div className="kbd">{t("try.receipt")} · {order.id}</div>
          <div className="display" style={{ fontSize: 38, margin: "8px 0 12px" }}>{money(order.amount)}</div>
          {[[t("try.r.to"), "Sari W. · Yogyakarta"], [t("try.r.from"), `${order.client.name} · ${order.client.city}`], [t("try.r.check"), `${order.criteria.length} / ${order.criteria.length} ✓`], ["Payout batch", payoutBatchId ?? "—"]].map(([a, b]) => (
            <div key={a} className="row between" style={{ padding: "7px 0", borderBottom: "2px dashed rgba(35,25,66,.15)", fontSize: 13.5, gap: 10 }}>
              <span className="muted">{a}</span><b style={{ textAlign: "right" }}>{b}</b>
            </div>
          ))}
          <div className={`stamp ${slam ? "slam" : ""}`} style={{ right: 12, top: 62 }}>LUNAS<small>{t("stamp.sub")}</small></div>
        </div>
        <Capi size={100} mood="love" motion={slam ? "jump" : "bob"} />
      </div>
      <style>{`.receipt{width:min(360px,100%);padding:22px;position:relative;background:#FFFEFA}`}</style>
    </div>
  );
}

function AgentLog({ logs }: { logs: Log[] }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" }); }, [logs.length]);
  const color = { ai: "#7FE3B5", pp: "#8CC4FF", hook: "#FFD84D", err: "#FF9A90" };
  return (
    <div className="card" style={{ background: "var(--ink)", color: "#D7DCEB", padding: 16 }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <b className="display" style={{ color: "#fff", fontSize: 17 }}>{t("log.title")}</b>
        <span className="row tiny" style={{ gap: 6, color: "#7FE3B5", fontWeight: 800 }}><span className="live-dot" /> live</span>
      </div>
      <div ref={ref} className="col" style={{ gap: 8, maxHeight: 340, overflowY: "auto" }}>
        {logs.map((l, i) => (
          <div key={i} className="logrow" style={{ borderLeftColor: color[l.kind] }}>
            <span style={{ color: color[l.kind], fontWeight: 800 }}>{l.who}</span> <span>{l.msg}</span>
            {l.res && <div style={{ color: "#8C94B0" }}>→ {l.res}</div>}
          </div>
        ))}
      </div>
      <style>{`
        .logrow{font:12px/1.55 ui-monospace,Menlo,Consolas,monospace;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05);border-left:3px solid;animation:rise .35s var(--ease) both;word-break:break-word}
        .live-dot{width:8px;height:8px;border-radius:50%;background:#3DDC97;animation:blinkd 1.4s infinite}
        @keyframes blinkd{50%{opacity:.25}}
      `}</style>
    </div>
  );
}

function seedLogs(o: Order): Log[] {
  const base: Log[] = [{ who: "contract_agent", msg: "parse_brief()", res: `${o.criteria.length} checkable criteria`, kind: "ai" }];
  if (o.status === "request") return base;
  base.push({ who: "contract", msg: "signed by both parties", res: "sha256: 9f2c…e41a", kind: "hook" });
  if (o.status === "awaiting_payment") return base;
  base.push({ who: "paypal", msg: "orders.capture", res: "status: COMPLETED", kind: "pp" });
  if (o.status === "in_escrow") return base;
  if (o.status === "revision") return [...base, { who: "verify_agent", msg: o.criteria[o.criteria.length - 1].rule, res: "✕ needs revision", kind: "err" }];
  base.push({ who: "verify_agent", msg: "all criteria met", res: "client review (72h)", kind: "ai" });
  if (o.status === "review") return base;
  return [...base, { who: "paypal", msg: "payouts.create", res: "SUCCESS", kind: "pp" }, { who: "webhook", msg: "PAYMENT.PAYOUTSBATCH.SUCCESS", res: "order → LUNAS ✓", kind: "hook" }];
}
