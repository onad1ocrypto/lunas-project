"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { getOrder, ORDERS, type Order, type ProductKind, type Status } from "@/lib/data";
import { MoneyRail } from "@/components/MoneyRail";
import { Capi } from "@/components/Capi";
import { Icon } from "@/components/Icon";
import { CriteriaList } from "@/components/DraftContract";
import {Avatar, Confetti, Country, Product, StatusBadge, Toast, CapiPose } from "@/components/ui";

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
  const { me } = useMe();
  const [status, setStatus] = useState<Status>(order.status);
  const [logs, setLogs] = useState<Log[]>(() => seedLogs(order));
  const [fire, setFire] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const [capture, setCapture] = useState("");
  const [refundInfo, setRefundInfo] = useState<{ percent: number; id: string; status: string; sim: boolean } | null>(null);

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
              onAccept={() => { setStatus("awaiting_payment"); log({ who: "contract", msg: `accepted by ${me.name.split(" ")[0]}`, res: "payment link sent to client", kind: "hook" }); flash(t("toast.accepted")); }}
              onDecline={() => { setStatus("declined"); log({ who: "contract", msg: "declined", kind: "err" }); }} />
          )}
          {status === "awaiting_payment" && (
            <PaymentPanel order={order} log={log} onCapture={setCapture}
              onPaid={() => { setStatus("in_escrow"); flash(t("toast.funded")); }} />
          )}
          {(status === "in_escrow" || status === "verifying" || status === "revision") && (
            <DeliveryPanel order={order} status={status} setStatus={setStatus} log={log} />
          )}
          {status === "review" && (
            <ReviewPanel order={order} log={log}
              onApproved={() => { setStatus("paid"); setJustPaid(true); setFire((f) => f + 1); }} />
          )}
          {status === "paid" && <PaidPanel order={order} slam={justPaid} refundInfo={refundInfo} />}
          {(status === "review" || status === "paid") && (
            <MediatorPanel order={order} log={log} capture={capture} onRefunded={setRefundInfo} />
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
            <div className="bubble">{order.brief.replaceAll("Sari", me.name.split(" ")[0])}</div>
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

function PaymentPanel({ order, log, onPaid, onCapture }: { order: Order; log: (l: Log) => void; onPaid: () => void; onCapture?: (id: string) => void }) {
  const { t } = useI18n();
  const { me } = useMe();
  const sleep = useSleep();
  const [phase, setPhase] = useState<"wait" | "paying" | "sealed">("wait");
  const PID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";
  const [sdk, setSdk] = useState(false);
  const ppRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!PID) return;
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${PID}&currency=USD&intent=capture`;
    s.async = true;
    s.onload = () => setSdk(true);
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, [PID]);
  useEffect(() => {
    if (!PID || !sdk || !ppRef.current || phase !== "wait") return;
    const w = window as unknown as { paypal?: { Buttons: (o: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void> } } };
    if (!w.paypal) return;
    ppRef.current.innerHTML = "";
    w.paypal.Buttons({
      style: { layout: "vertical", color: "gold", shape: "pill", label: "paypal", height: 44 },
      createOrder: async () => {
        log({ who: "paypal", msg: "orders.create", res: `intent: CAPTURE · ${order.amount.toFixed(2)} ${order.currency}`, kind: "pp" });
        const r = await fetch("/api/paypal/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, amount: order.amount, currency: order.currency, description: order.title, nonce: Date.now() }) });
        const j = await r.json();
        if (!r.ok || !j.paypalOrderId) throw new Error(j.error || "orders.create failed");
        return j.paypalOrderId as string;
      },
      onApprove: async (data: { orderID: string }) => {
        setPhase("paying");
        log({ who: "paypal", msg: "orders.capture", res: `id: ${data.orderID.slice(0, 14)}…`, kind: "pp" });
        const r = await fetch("/api/paypal/capture-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paypalOrderId: data.orderID }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "orders.capture failed");
        if (j.captureId) { onCapture?.(String(j.captureId)); log({ who: "paypal", msg: "capture.id", res: String(j.captureId), kind: "pp" }); }
        setPhase("sealed");
        log({ who: "webhook", msg: "PAYMENT.CAPTURE.COMPLETED", res: `order → IN_ESCROW · ${me.name.split(" ")[0]} notified`, kind: "hook" });
        await new Promise((res) => setTimeout(res, 900));
        onPaid();
      },
      onError: (e: unknown) => { log({ who: "paypal", msg: "sdk.error", res: String(e).slice(0, 80), kind: "err" }); setPhase("wait"); },
    }).render(ppRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [PID, sdk, phase]);
  const pay = async () => {
    try {
      setPhase("paying");
      log({ who: "paypal", msg: "orders.create", res: `intent: CAPTURE · ${(order.amount * 1.025).toFixed(2)} USD`, kind: "pp" });
      await sleep(1100);
      log({ who: "paypal", msg: "orders.capture", res: "status: COMPLETED", kind: "pp" });
      setPhase("sealed");
      await sleep(1700);
      log({ who: "webhook", msg: "PAYMENT.CAPTURE.COMPLETED", res: `order → IN_ESCROW · ${me.name.split(" ")[0]} notified`, kind: "hook" });
      onPaid();
    } catch {}
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
          <code style={{ background: "var(--paper)", border: "2.5px dashed var(--ink)", borderRadius: 12, padding: "10px 12px", fontWeight: 800 }}>lunas.app/pay/{order.id}</code>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm"><Icon name="copy" size={15} /> {t("new.copy")}</button>
            <button className="btn sm"><Icon name="bell" size={15} /> {t("pay.remind")}</button>
          </div>
          {PID ? (
            <div className="demo-box">
              <div className="kbd" style={{ marginBottom: 8 }}>{sdk ? t("pay.sandbox") : t("pay.loading")}</div>
              <div ref={ppRef} style={{ minHeight: 44 }} />
            </div>
          ) : (
          <div className="demo-box">
            <div className="kbd" style={{ marginBottom: 8 }}>{t("demo.label")}</div>
            <button className="btn paypal" disabled={phase !== "wait"} onClick={pay}>
              {phase === "paying" ? <><span className="spin" style={{ width: 16, height: 16, border: "2.5px solid var(--ink)", borderTopColor: "transparent", borderRadius: "50%" }} /> {t("pay.processing")}</>
                : phase === "sealed" ? <><Icon name="check" size={16} /> {t("pay.captured")}</>
                : <>{t("pay.simulate")} <i>Pay<b>Pal</b></i></>}
            </button>
          </div>
          )}
        </div>
      </div>
      <style>{`
        .pay-grid{display:grid;grid-template-columns:220px 1fr;gap:22px;align-items:center}
        .env{position:relative;width:200px;height:130px;margin:40px auto 10px;perspective:600px}
        .env-back{position:absolute;inset:0;background:var(--peach);border:2.5px solid var(--ink);border-radius:12px}
        .env-bill{position:absolute;left:30px;right:30px;top:-60px;height:70px;background:var(--mint);color:#231942;border:2.5px solid var(--ink);border-radius:8px;display:grid;place-items:center;font-family:var(--font-display);font-size:30px;font-weight:700;z-index:1;transition:transform .9s var(--ease)}
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

const DELIVERY: ProductKind[] = ["bottle", "mug", "shoe", "bag", "candle", "watch", "plant", "cap"];
const BAD = 5;
type Check = "idle" | "run" | "pass" | "fail";

function DeliveryPanel({ order, status, setStatus, log }: { order: Order; status: Status; setStatus: (s: Status) => void; log: (l: Log) => void }) {
  const { t } = useI18n();
  const sleep = useSleep();
  const [uploaded, setUploaded] = useState(status !== "in_escrow");
  const [scan, setScan] = useState(0);
  const [checks, setChecks] = useState<Check[]>(() => order.criteria.map((_, i) => (status === "revision" ? (i === order.criteria.length - 1 ? "fail" : "pass") : "idle")));
  const [fixed, setFixed] = useState(false);
  const failIdx = order.criteria.length - 1;
  const setC = (i: number, c: Check) => setChecks((x) => x.map((v, j) => (j === i ? c : v)));

  const upload = async () => {
    try {
      setUploaded(true);
      log({ who: "webhook", msg: "delivery.uploaded", res: "20 files · 61.4 MB", kind: "hook" });
    } catch {}
  };
  const verify = async () => {
    try {
      setStatus("verifying");
      setScan((s) => s + 1);
      log({ who: "verify_agent", msg: "start", res: `${order.criteria.length} criteria from ${order.id}`, kind: "ai" });
      setChecks(order.criteria.map(() => "run"));
      let verdict: { results?: { pass: boolean; note: string }[] } | null = null;
      try {
        const vr = await fetch("/api/agent/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ criteria: order.criteria, attempt: fixed ? 2 : 1 }) });
        if (vr.ok) verdict = await vr.json();
      } catch {}
      for (let i = 0; i < order.criteria.length; i++) {
        await sleep(650);
        const fail = verdict?.results ? !verdict.results[i]?.pass : i === failIdx && !fixed;
        const note = fail ? (verdict?.results?.[i]?.note ?? "IMG_014 ✕ (21% non-white)") : "✓";
        setC(i, fail ? "fail" : "pass");
        log({ who: "verify_agent", msg: order.criteria[i].rule, res: fail ? note.replace(":", " ✕") : "✓", kind: fail ? "err" : "ai" });
      }
      if (!fixed) {
        await sleep(300);
        log({ who: "verify_agent", msg: "request_revision(IMG_014)", res: "funds stay in escrow", kind: "ai" });
        setStatus("revision");
      } else {
        await sleep(500);
        log({ who: "verify_agent", msg: "all criteria met", res: "client review (72h)", kind: "ai" });
        setStatus("review");
      }
    } catch {}
  };
  const reupload = async () => {
    try {
      setFixed(true);
      log({ who: "webhook", msg: "delivery.revised", res: "IMG_014 v2", kind: "hook" });
      setC(failIdx, "run");
      await sleep(900);
      setC(failIdx, "pass");
      log({ who: "verify_agent", msg: order.criteria[failIdx].rule, res: "✓", kind: "ai" });
      await sleep(700);
      log({ who: "verify_agent", msg: "all criteria met", res: "client review (72h)", kind: "ai" });
      setStatus("review");
    } catch {}
  };

  const head = status === "revision" ? { c: "var(--peach)", i: "refresh", t: t("dl.revT"), s: t("dl.revB") }
    : status === "verifying" ? { c: "var(--lav)", i: "bot", t: t("dl.verT"), s: t("dl.verB") }
    : { c: "var(--sky)", i: "upload", t: t("dl.t"), s: t("dl.b") };

  return (
    <div className="card pad rise" style={{ background: status === "revision" ? "var(--peach-l)" : status === "verifying" ? "var(--lav-l)" : "var(--sky-l)" }}>
      <PanelHead color={head.c} icon={head.i} title={head.t} sub={head.s} />
      {!uploaded ? (
        <button className="drop" onClick={upload}>
          <span className="drop-ic float"><Icon name="upload" size={30} /></span>
          <b style={{ fontSize: 17 }}>{t("dl.drop")}</b>
          <span className="tiny muted">{t("dl.dropSub")}</span>
        </button>
      ) : (
        <div className="dl-grid">
          <div style={{ position: "relative" }}>
            {scan > 0 && <div key={scan} className="scanline" />}
            <div className="thumbs stagger">
              {DELIVERY.map((k, i) => {
                const bad = i === BAD && !fixed && (checks[failIdx] === "fail");
                const ok = checks.every((c) => c === "pass") || (checks[failIdx] === "fail" && i !== BAD);
                return (
                  <div key={k + (i === BAD && fixed ? "v2" : "")} className={`thumb ${bad ? "bad" : ""}`}>
                    <Product kind={k} bg={i === BAD && !fixed ? "#D9D4CC" : "#fff"} />
                    <span className="thumb-name">IMG_{String([1, 4, 7, 9, 11, 14, 16, 19][i]).padStart(3, "0")}</span>
                    {(bad || ok) && <span className="thumb-badge" style={{ background: bad ? "var(--red)" : "var(--green)" }}>{bad ? "!" : "✓"}</span>}
                  </div>
                );
              })}
              <div className="thumb more">+12</div>
            </div>
          </div>
          <div className="col" style={{ gap: 8 }}>
            {order.criteria.map((c, i) => (
              <div key={c.label} className={`chk ${checks[i]}`}>
                <span className="chk-st">{checks[i] === "pass" ? "✓" : checks[i] === "fail" ? "✕" : ""}</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</span>
              </div>
            ))}
            {status === "in_escrow" && <button className="btn lav" style={{ marginTop: 6 }} onClick={verify}><Icon name="bot" size={17} /> {t("dl.run")}</button>}
            {status === "revision" && (
              <div className="note pop-in">
                <b className="row" style={{ gap: 6 }}><Capi size={30} motion="none" mood="think" /> {t("dl.agentSays")}</b>
                <p style={{ margin: "6px 0 10px", fontSize: 14 }}>{t("dl.agentMsg")}</p>
                <button className="btn sm peach" style={{ background: "var(--peach)" }} onClick={reupload}><Icon name="upload" size={15} /> {t("dl.reupload")}</button>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`
        .drop{width:100%;border:3px dashed var(--ink);border-radius:20px;padding:34px 20px;background:rgba(255,255,255,.7);display:flex;flex-direction:column;align-items:center;gap:8px;transition:.2s}
        .drop:hover{background:#fff;transform:scale(1.01)}
        .drop-ic{width:62px;height:62px;border-radius:18px;border:2.5px solid var(--ink);background:var(--sky);display:grid;place-items:center;box-shadow:3px 3px 0 var(--ink)}
        .dl-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:18px}
        .thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .thumb{aspect-ratio:1;border:2.5px solid var(--ink);border-radius:14px;overflow:hidden;position:relative;background:#fff}
        .thumb.bad{box-shadow:0 0 0 3px var(--red);animation:shake .45s}
        .thumb.more{display:grid;place-items:center;font-weight:900;border-style:dashed;background:transparent}
        .thumb-name{position:absolute;left:5px;bottom:3px;font-size:9.5px;font-weight:800;color:#5b5280}
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

function ReviewPanel({ order, log, onApproved }: { order: Order; log: (l: Log) => void; onApproved: () => void }) {
  const { t } = useI18n();
  const sleep = useSleep();
  const TOTAL = 72 * 3600;
  const [left, setLeft] = useState(TOTAL - 3 * 3600 - 52 * 60);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000); return () => clearInterval(id); }, []);
  const hh = String(Math.floor(left / 3600)).padStart(2, "0"), mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  const C = 2 * Math.PI * 64;

  const approve = async () => {
    try {
      setBusy(true);
      log({ who: "release_policy", msg: "client_approved()", res: `${order.client.name.split(" ")[0]} · ${hh}h left`, kind: "ai" });
      await sleep(600);
      log({ who: "paypal", msg: "payouts.create", res: `receiver: sari.w@… · ${order.amount.toFixed(2)} USD`, kind: "pp" });
      await sleep(900);
      log({ who: "webhook", msg: "PAYMENT.PAYOUTSBATCH.SUCCESS", res: "order → LUNAS ✓", kind: "hook" });
      onApproved();
    } catch {}
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
            <button className="btn mint" disabled={busy} onClick={approve}><Icon name="check" size={17} /> {busy ? t("rev.releasing") : t("rev.simulate")}</button>
          </div>
        </div>
      </div>
      <style>{`.demo-box2{border:2.5px dashed var(--ink-3);border-radius:16px;padding:12px;background:rgba(255,255,255,.6)}`}</style>
    </div>
  );
}

function PaidPanel({ order, slam, refundInfo }: { order: Order; slam: boolean; refundInfo?: { percent: number; id: string; status: string; sim: boolean } | null }) {
  const { t, money, date } = useI18n();
  const { me } = useMe();
  const certRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const download = async () => {
    if (!certRef.current || busy) return;
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(certRef.current, { pixelRatio: 2, backgroundColor: "#FFFEFA", cacheBust: true });
      const a = document.createElement("a");
      a.href = url;
      a.download = `lunas-certificate-${order.id}.png`;
      a.click();
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } catch {}
    setBusy(false);
  };

  const rows: [string, string][] = [
    [t("try.r.to"), `${me.name} · ${me.city}, ${me.country}`],
    [t("try.r.from"), `${order.client.name} · ${order.client.city}, ${order.client.country}`],
    [t("try.r.check"), `${order.criteria.length} / ${order.criteria.length} ✓`],
    [t("cert.date"), date(new Date().toISOString(), { day: "numeric", month: "long", year: "numeric" })],
  ];

  return (
    <div className="card pad rise" style={{ background: "var(--mint-l)" }}>
      <PanelHead color="var(--mint)" icon="heart" title={t("paid.t")} sub={t("paid.b", { amount: money(order.amount) })} />
      {refundInfo && (
        <div className="row wrap voidnote" style={{ gap: 10, marginBottom: 14 }}>
          <Icon name="refund" size={18} />
          <b>{t("med.voided", { p: refundInfo.percent })}</b>
          <span className="mono tiny">refund {refundInfo.status} · {refundInfo.id}{refundInfo.sim ? " · demo" : ""}</span>
        </div>
      )}
      <div className="row wrap" style={{ gap: 22, justifyContent: "center", alignItems: "center" }}>
        <div ref={certRef} className={`cert ${slam ? "shake" : ""}`} style={{ animationDelay: ".25s" }}>
          <span className="cc tl" /><span className="cc tr" /><span className="cc bl" /><span className="cc br" />
          <div className="col" style={{ alignItems: "center", gap: 3 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/emblem.png" alt="" style={{ width: 46, height: 46, objectFit: "contain" }} />
            <span className="kbd">LUNAS ESCROW · {order.id}</span>
            <b className="display" style={{ fontSize: 25 }}>{t("cert.title")}</b>
            <span className="tiny muted" style={{ fontWeight: 700 }}>{t("cert.no")} {order.id}</span>
          </div>
          <div className="display" style={{ fontSize: 46, textAlign: "center", margin: "10px 0 4px" }}>{money(order.amount)}</div>
          <div className="col" style={{ margin: "4px 0 10px" }}>
            {rows.map(([a, b]) => (
              <div key={a} className="row between" style={{ padding: "7px 2px", borderBottom: "2px dashed rgba(35,25,66,.18)", fontSize: 13.5, gap: 12 }}>
                <span className="muted">{a}</span><b style={{ textAlign: "right" }}>{b}</b>
              </div>
            ))}
          </div>
          <div className="tiny" style={{ textAlign: "center", fontWeight: 800 }}>✓ {t("cert.verified", { n: order.criteria.length })}</div>
          <div className="row between" style={{ alignItems: "flex-end", marginTop: 14, gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wax-seal.png" alt="" className="cert-wax" />
            <div className="col" style={{ alignItems: "center", gap: 1, paddingBottom: 6 }}>
              <span className="mono tiny" style={{ opacity: .7 }}>5UXD2E8A7EBQJ</span>
              <span className="tiny muted" style={{ fontWeight: 800 }}>Payout ID</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/stamp-seal.png" alt="LUNAS" className={`cert-stamp ${slam ? "" : "still"}`} />
          </div>
        </div>
        <div className="col" style={{ gap: 12, alignItems: "center", minWidth: 160 }}>
          <CapiPose pose={slam ? "jump" : "idle"} size={104} className={slam ? "capi-pop" : "capi-float"} />
          <button className="btn mint" onClick={download} disabled={busy}>
            <Icon name="download" size={16} /> {t("cert.download")}
          </button>
          <span className="tiny muted" style={{ fontWeight: 700, textAlign: "center" }}>{t("cert.hint")}</span>
        </div>
      </div>
      <Toast show={saved}>{t("cert.toast")}</Toast>
    </div>
  );
}

type Verdict = {
  decision: "release" | "refund_partial" | "refund_full" | "escalate";
  percent: number; confidence: number; reasons: string[]; evidence: string[]; nextStep: string; source: "llm" | "local";
};

/* fixed light palette so the verdict card stays readable on every theme */
const DEC_COLOR: Record<Verdict["decision"], string> = {
  release: "#E4F7EC", refund_partial: "#FFF3C9", refund_full: "#FFE1DE", escalate: "#ECE6FF",
};

function MediatorPanel({ order, log, capture, onRefunded }: {
  order: Order; log: (l: Log) => void; capture: string;
  onRefunded: (r: { percent: number; id: string; status: string; sim: boolean }) => void;
}) {
  const { t, money, lang } = useI18n();
  const { me } = useMe();
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState<Verdict | null>(null);
  const [capId, setCapId] = useState(capture);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ id: string; status: string; sim: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (capture) setCapId(capture); }, [capture]);

  const ask = async () => {
    if (claim.trim().length < 6) { setErr(t("med.short")); return; }
    setErr(null); setBusy(true); setDone(null);
    log({ who: "mediator_agent", msg: "open_dispute()", res: `${claim.trim().split(/\s+/).length} words · ${order.criteria.length} criteria on file`, kind: "ai" });
    try {
      const r = await fetch("/api/agent/mediate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id, claim, lang, amount: order.amount, attempts: 1, late: false, hoursSinceDelivery: 20,
          criteria: order.criteria.map((c) => ({ label: c.label, pass: true })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "mediate failed");
      setV(j as Verdict);
      log({ who: "mediator_agent", msg: `verdict: ${j.decision}`, res: `${j.percent}% → client · confidence ${(Number(j.confidence) * 100).toFixed(0)}% · ${j.source}`, kind: "ai" });
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
      log({ who: "mediator_agent", msg: "verdict.error", res: String(e).slice(0, 80), kind: "err" });
    }
    setBusy(false);
  };

  const refundAmount = v ? Math.round(order.amount * v.percent) / 100 : 0;
  const realCapture = /^[A-Za-z0-9_-]{10,}$/.test(capId.trim());

  const execute = async () => {
    if (!v || paying) return;
    setPaying(true); setErr(null);
    log({
      who: "paypal", msg: "captures.refund",
      res: realCapture
        ? `capture: ${capId.trim().slice(0, 12)}… · ${v.percent >= 100 ? "full capture amount" : `${refundAmount.toFixed(2)} ${order.currency}`}`
        : "demo mode · no capture on record",
      kind: "pp",
    });
    if (realCapture) {
      try {
        const r = await fetch("/api/paypal/refund", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            captureId: capId.trim(), orderId: order.id,
            amount: v.percent >= 100 ? undefined : refundAmount,
            currency: order.currency, reason: v.decision, note: `Lunas mediator: ${v.nextStep}`.slice(0, 240),
          }),
        });
        const j = await r.json();
        if (!r.ok || !j.refundId) throw new Error(j.error || "captures.refund failed");
        setDone({ id: j.refundId, status: j.status, sim: false });
        log({ who: "paypal", msg: `refund ${j.status}`, res: `id: ${j.refundId} · ${v.percent >= 100 ? "full capture refunded" : `${refundAmount.toFixed(2)} ${order.currency}`}`, kind: "pp" });
        log({ who: "webhook", msg: "PAYMENT.CAPTURE.REFUNDED", res: `${v.percent}% → client · certificate voided`, kind: "hook" });
        onRefunded({ percent: v.percent, id: j.refundId, status: j.status, sim: false });
      } catch (e) {
        const m = String(e instanceof Error ? e.message : e);
        setErr(`${t("med.err")}: ${m}`);
        log({ who: "paypal", msg: "refund.error", res: m.slice(0, 90), kind: "err" });
      }
    } else {
      await new Promise((r) => setTimeout(r, 900));
      const id = `SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      setDone({ id, status: "COMPLETED", sim: true });
      log({ who: "paypal", msg: "refund COMPLETED (simulated)", res: `id: ${id} · ${refundAmount.toFixed(2)} ${order.currency}`, kind: "pp" });
      onRefunded({ percent: v.percent, id, status: "COMPLETED", sim: true });
    }
    setPaying(false);
  };

  return (
    <div className="card pad rise">
      <PanelHead color="var(--peach)" icon="scale" title={t("med.t")} sub={t("med.b")} />
      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
        <span className="kbd">{t("med.chips")}</span>
        {[1, 2, 3, 4].map((n) => (
          <button key={n} className="chip" onClick={() => { setClaim(t(`med.chip.${n}`)); setV(null); setDone(null); setErr(null); }}>
            {t(`med.chip.${n}`).slice(0, 46)}{t(`med.chip.${n}`).length > 46 ? "…" : ""}
          </button>
        ))}
      </div>
      <textarea className="med-ta" rows={3} value={claim} placeholder={t("med.ph")}
        onChange={(e) => { setClaim(e.target.value); if (err) setErr(null); }} />
      <div className="row wrap between" style={{ gap: 10, marginTop: 10 }}>
        <button className="btn peach" style={{ background: "var(--peach)" }} disabled={busy} onClick={ask}>
          {busy ? <><span className="spin" style={{ width: 16, height: 16, border: "2.5px solid var(--ink)", borderTopColor: "transparent", borderRadius: "50%" }} /> {t("med.thinking")}</>
                : <><Icon name="scale" size={17} /> {t("med.ask")}</>}
        </button>
        {v && <span className="tiny muted row" style={{ gap: 6, fontWeight: 800 }}>
          <Icon name={v.source === "llm" ? "sparkles" : "bot"} size={14} /> {v.source === "llm" ? t("med.src.llm") : t("med.src.local")}
        </span>}
      </div>
      {err && <div className="med-err">{err}</div>}

      {v && (
        <div className="med-verdict pop-in" style={{ background: DEC_COLOR[v.decision] }}>
          <div className="row wrap between" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 12, alignItems: "center" }}>
              <span className="med-pct">{v.percent}%</span>
              <div>
                <b className="display" style={{ fontSize: 19 }}>{t(`med.dec.${v.decision}`)}</b>
                <div className="tiny" style={{ fontWeight: 800, opacity: .75 }}>
                  {v.percent > 0 ? t("med.amount", { p: v.percent, amt: money(refundAmount) }) : money(order.amount)} → {v.decision === "release" ? me.name.split(" ")[0] : order.client.name.split(" ")[0]}
                </div>
              </div>
            </div>
            <div className="col" style={{ gap: 4, minWidth: 150 }}>
              <span className="tiny" style={{ fontWeight: 800 }}>{t("med.conf")} · {(v.confidence * 100).toFixed(0)}%</span>
              <span className="med-bar"><i style={{ width: `${Math.round(v.confidence * 100)}%` }} /></span>
            </div>
          </div>

          <div className="med-cols">
            <div className="col" style={{ gap: 6 }}>
              <span className="kbd">{t("med.why")}</span>
              <ul className="med-list">{v.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
            <div className="col" style={{ gap: 6 }}>
              <span className="kbd">{t("med.signals")}</span>
              <div className="row wrap" style={{ gap: 5 }}>
                {v.evidence.map((e, i) => <code key={i} className="sig">{e}</code>)}
              </div>
            </div>
          </div>

          <div className="med-next"><Icon name="right" size={15} /> <span>{v.nextStep}</span></div>

          {v.decision === "refund_partial" || v.decision === "refund_full" ? (
            <div className="med-pay">
              <label className="tiny row" style={{ gap: 6, fontWeight: 800 }}>
                <Icon name="wallet" size={14} /> {t("med.capture")}
                <input className="med-in mono" value={capId} placeholder="7YY369168N8549901"
                  onChange={(e) => setCapId(e.target.value)} />
              </label>
              {!realCapture && <span className="tiny muted" style={{ fontWeight: 700 }}>{t("med.nocap")}</span>}
              {done ? (
                <div className="row wrap" style={{ gap: 8, fontWeight: 800 }}>
                  <Icon name="check" size={16} /> {t("med.done", { status: done.status, id: done.id })}
                  {done.sim && <span className="kbd">demo</span>}
                </div>
              ) : (
                <button className="btn sm paypal" disabled={paying} onClick={execute}>
                  {paying ? <><span className="spin" style={{ width: 15, height: 15, border: "2.5px solid var(--ink)", borderTopColor: "transparent", borderRadius: "50%" }} /> {t("med.executing")}</>
                          : <><Icon name="refund" size={16} /> {realCapture ? t("med.exec") : t("med.simulate")}</>}
                </button>
              )}
            </div>
          ) : (
            <div className="med-pay tiny" style={{ fontWeight: 800 }}>
              <Icon name={v.decision === "escalate" ? "lock" : "check"} size={15} />
              {v.decision === "escalate" ? t("med.frozen") : t("med.next")}
            </div>
          )}
        </div>
      )}

      <style>{`
        .chip{border:2.5px solid var(--ink);border-radius:999px;background:var(--paper);padding:6px 11px;font:700 12px/1.2 var(--font-body);cursor:pointer;transition:.18s var(--spring);max-width:100%;text-align:left}
        .chip:hover{background:var(--lemon);transform:translateY(-2px);box-shadow:2px 2px 0 var(--ink)}
        .med-ta{width:100%;border:2.5px solid var(--ink);border-radius:14px;background:var(--paper);padding:12px 14px;font:600 14.5px/1.55 var(--font-body);color:var(--ink);resize:vertical}
        .med-ta:focus{outline:none;background:#fff;box-shadow:3px 3px 0 var(--ink)}
        .med-err{margin-top:10px;padding:10px 12px;border:2.5px solid var(--ink);border-left-width:8px;border-left-color:var(--red);border-radius:12px;background:var(--red-l);font-weight:800;font-size:13.5px}
        .med-verdict{margin-top:14px;border:2.5px solid #231942;border-radius:18px;padding:16px;color:#231942;box-shadow:4px 4px 0 rgba(35,25,66,.22)}
        .med-verdict .muted,.med-verdict .tiny{color:#5b5280}
        .med-verdict .kbd,.med-pay .kbd{color:#5b5280}
        .med-pct{font-family:var(--font-display);font-size:40px;font-weight:700;line-height:1;border:2.5px solid #231942;border-radius:16px;background:#fff;color:#231942;padding:6px 12px;box-shadow:3px 3px 0 #231942}
        .med-bar{display:block;height:12px;border:2.5px solid #231942;border-radius:999px;background:#fff;overflow:hidden}
        .med-bar i{display:block;height:100%;background:#2E9E6B;border-right:2.5px solid #231942;transition:width .6s var(--ease)}
        .med-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
        .med-list{margin:0;padding-left:18px;font-size:13.5px;line-height:1.6;font-weight:600}
        .sig{font:11.5px/1.5 ui-monospace,Menlo,Consolas,monospace;border:2px solid #231942;border-radius:8px;background:rgba(255,255,255,.8);color:#231942;padding:2px 6px}
        .med-next{display:flex;gap:8px;align-items:flex-start;margin-top:14px;padding:11px 13px;border:2.5px dashed #231942;border-radius:14px;background:rgba(255,255,255,.6);color:#231942;font-weight:800;font-size:14px}
        .med-pay{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px;padding-top:12px;border-top:2.5px dashed rgba(35,25,66,.3);color:#231942}
        .med-pay .muted{color:#5b5280}
        .med-in{border:2.5px solid #231942;border-radius:10px;background:#fff;color:#231942;padding:6px 9px;font-size:12px;min-width:190px;flex:1}
        .voidnote{border:2.5px solid #231942;border-left-width:8px;border-left-color:#D93025;border-radius:14px;background:#FFE1DE;color:#231942;padding:11px 13px;font-size:14px}
        .voidnote .mono{color:#8a2019}
        @media (max-width:700px){.med-cols{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}

function AgentLog({ logs }: { logs: Log[] }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" }); }, [logs.length]);
  const color = { ai: "#7FE3B5", pp: "#8CC4FF", hook: "#FFD84D", err: "#FF9A90" };
  return (
    <div className="card" style={{ background: "#231942", color: "#D7DCEB", padding: 16 }}>
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
