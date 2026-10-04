"use client";

/**
 * Public checkout — what the client sees when they open a Lunas payment link.
 * Fund the escrow with PayPal, then wait for the freelancer's delivery to clear
 * verification. No account needed, no crypto, no surprises.
 */

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Capi } from "@/components/Capi";
import { Icon } from "@/components/Icon";
import { PayPalButtons, PayPalMark } from "@/components/PayPalButtons";
import { Confetti, Country, LangSwitch, Logo, ThemeSwitch } from "@/components/ui";

type OrderView = {
  id: string;
  title: string;
  brief: string;
  amount: number;
  currency: string;
  due: string;
  status: string;
  windowHours: number;
  client: { name: string; city: string; country: string };
  freelancer: { name: string; city: string; country: string };
  criteria: { label: string; rule: string }[];
  paypal: { orderId?: string; captureId?: string; approvalUrl?: string };
  verification?: { verdict: string; summary: string; results: { label: string; status: string; evidence: string }[] };
};

const FEE = 0.025;

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fire, setFire] = useState(0);
  const [receipt, setReceipt] = useState<{ captureId?: string; paypalOrderId?: string; payerEmail?: string } | null>(null);
  const [mode, setMode] = useState<string>("…");

  const load = useCallback(async () => {
    const res = await api.getOrder(id);
    if (!res.ok) {
      setError(res.error ?? "Order not found");
      return;
    }
    setOrder(res.data.order);
  }, [id]);

  useEffect(() => {
    load();
    api.health().then((h) => setMode(h.data?.paypal ?? "unknown"));
  }, [load]);

  const funded = order ? ["in_escrow", "verifying", "revision", "review", "paid"].includes(order.status) : false;
  const gross = order ? Number((order.amount * (1 + FEE)).toFixed(2)) : 0;

  return (
    <div className="pay-shell">
      <header className="pub-nav">
        <Logo />
        <div className="row" style={{ gap: 10 }}>
          <span className={`mode-pill ${mode === "simulated" ? "sim" : "live"}`} title="Which PayPal mode this deployment is running">
            {mode === "simulated" ? "PayPal: simulated" : mode === "sandbox" ? "PayPal: sandbox" : "PayPal: live"}
          </span>
          <ThemeSwitch />
          <LangSwitch compact />
        </div>
      </header>

      <main className="pay-main">
        {error && (
          <div className="card pad col" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
            <Capi size={90} mood="think" />
            <h1 style={{ fontSize: 26 }}>We couldn&apos;t open that order</h1>
            <p className="muted">{error}</p>
            <Link className="btn" href="/"><Icon name="left" size={16} /> Back to Lunas</Link>
          </div>
        )}

        {order && (
          <>
            <section className="card pad rise" style={{ position: "relative" }}>
              <div className="row between wrap" style={{ gap: 12 }}>
                <div>
                  <span className="mono tiny" style={{ fontWeight: 800 }}>{order.id}</span>
                  <h1 style={{ fontSize: "clamp(26px,4vw,38px)", marginTop: 6 }}>{order.title}</h1>
                  <div className="row tiny muted" style={{ gap: 8, marginTop: 6, fontWeight: 700 }}>
                    <Icon name="user" size={14} /> {order.freelancer.name} · {order.freelancer.city} <Country code={order.freelancer.country} />
                    <span>→</span>
                    {order.client.name} · {order.client.city} <Country code={order.client.country} />
                  </div>
                </div>
                <div className="col" style={{ alignItems: "flex-end" }}>
                  <div className="display" style={{ fontSize: 40 }}>${order.amount.toFixed(2)}</div>
                  <span className="tiny muted">released to the freelancer on approval</span>
                </div>
              </div>

              <div className="bubble" style={{ marginTop: 16 }}>{order.brief}</div>

              <div style={{ marginTop: 18 }}>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <b>This is what will be checked by AI</b>
                  <span className="badge" style={{ background: "var(--mint-l)" }}><Icon name="bot" size={13} /> auto-verified</span>
                </div>
                <div className="crit-grid">
                  {order.criteria.map((c) => (
                    <div key={c.label} className="row crit" style={{ background: "var(--cream)", gap: 10, padding: "10px 12px", border: "2.5px solid var(--ink)", borderRadius: 14 }}>
                      <span className="crit-ic"><Icon name="check" size={15} /></span>
                      <div className="grow">
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{c.label}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>{c.rule}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="money-box" style={{ marginTop: 18 }}>
                <div className="row between"><span>Order amount</span><b>${order.amount.toFixed(2)}</b></div>
                <div className="row between tiny muted"><span>Escrow &amp; protection fee ({(FEE * 100).toFixed(1)}%)</span><span>${(gross - order.amount).toFixed(2)}</span></div>
                <div className="row between" style={{ marginTop: 6, paddingTop: 8, borderTop: "2px dashed rgba(35,25,66,.2)" }}>
                  <span style={{ fontWeight: 800 }}>You pay now</span>
                  <b className="display" style={{ fontSize: 26 }}>${gross.toFixed(2)}</b>
                </div>
              </div>
            </section>

            <aside className="col" style={{ gap: 18 }}>
              {!funded && order.status !== "paid" && (
                <div className="card pad rise" style={{ animationDelay: ".08s" }}>
                  <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                    <span className="pay-ic"><Icon name="lock" size={20} /></span>
                    <div>
                      <h2 style={{ fontSize: 20 }}>Fund the escrow</h2>
                      <p className="tiny muted">{order.freelancer.name.split(" ")[0]} can&apos;t touch this money yet — it's released only when the work passes.</p>
                    </div>
                  </div>
                  <PayPalButtons
                    lunasOrderId={order.id}
                    amount={gross}
                    currency={order.currency}
                    onProcessing={setBusy}
                    onError={(m) => setError(m)}
                    onCaptured={(payer) => {
                      setReceipt(payer);
                      setFire((f) => f + 1);
                      load();
                    }}
                  />
                  {busy && <div className="tiny muted" style={{ marginTop: 8 }}>Talking to PayPal…</div>}
                  {params.get("status") === "cancel" && <div className="tiny" style={{ marginTop: 8, color: "var(--red)" }}>Payment cancelled — the escrow is still waiting.</div>}
                </div>
              )}

              {(funded || order.status === "paid") && (
                <div className="card pad rise" style={{ background: order.status === "paid" ? "var(--mint-l)" : "var(--sky-l)" }}>
                  <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                    <Capi size={64} mood={order.status === "paid" ? "love" : "wink"} motion={order.status === "paid" ? "jump" : "bob"} />
                    <div>
                      <h2 style={{ fontSize: 20 }}>{order.status === "paid" ? "LUNAS — paid in full" : "Money is in escrow"}</h2>
                      <p className="tiny" style={{ marginTop: 4 }}>
                        {order.status === "paid"
                          ? `${order.freelancer.name.split(" ")[0]} has been paid $${order.amount.toFixed(2)} via PayPal Payouts.`
                          : `${order.freelancer.name.split(" ")[0]} is working. Your money is held until the delivery passes verification.`}
                      </p>
                    </div>
                  </div>

                  <div className="kv">
                    <Row k="PayPal order" v={order.paypal.orderId} />
                    <Row k="Capture" v={order.paypal.captureId} />
                    <Row k="Review window" v={`${order.windowHours}h after verification`} />
                    {receipt?.payerEmail && <Row k="Payer" v={receipt.payerEmail} />}
                  </div>

                  {order.verification && (
                    <div style={{ marginTop: 14 }}>
                      <b className="tiny">Verification report</b>
                      <p className="tiny muted" style={{ marginTop: 4 }}>{order.verification.summary}</p>
                      <div className="col" style={{ gap: 6, marginTop: 8 }}>
                        {order.verification.results.map((r) => (
                          <div key={r.label} className="tiny row" style={{ gap: 8 }}>
                            <span className={`vd ${r.status}`}>{r.status === "pass" ? "✓" : r.status === "fail" ? "✕" : "…"}</span>
                            <span className="grow">{r.label}</span>
                            <span className="muted">{r.evidence}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="card pad" style={{ background: "var(--cream)" }}>
                <b className="row" style={{ gap: 8 }}><PayPalMark /> Why PayPal here</b>
                <ul className="tiny" style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Payment is captured up front (Orders v2) so the freelancer knows the money exists.</li>
                  <li>It leaves escrow only through a Payouts call after AI verification + your approval (or {order.windowHours}h of silence).</li>
                  <li>Disputes are refunded with the Payments v1 refund API — no chargebacks, no crypto wallet.</li>
                </ul>
              </div>
            </aside>
          </>
        )}
      </main>

      <Confetti fire={fire} />
      <style>{`
        .pay-shell{min-height:100vh}
        .pay-main{max-width:1120px;margin:0 auto;padding:26px 22px 80px;display:grid;grid-template-columns:1.5fr 1fr;gap:22px;align-items:start}
        .pay-ic{width:42px;height:42px;border-radius:13px;border:2.5px solid var(--ink);background:var(--lemon);display:grid;place-items:center;box-shadow:2px 2px 0 var(--ink);flex:none}
        .crit-ic{width:30px;height:30px;border-radius:9px;border:2px solid var(--ink);background:var(--paper);display:grid;place-items:center;flex:none}
        .crit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
        .kv{margin-top:12px;display:flex;flex-direction:column;gap:6px}
        .mode-pill{font-size:11.5px;font-weight:900;padding:5px 10px;border-radius:999px;border:2px solid var(--ink);background:var(--mint-l)}
        .mode-pill.sim{background:var(--lemon-l)}
        .vd{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-weight:900;border:2px solid var(--ink);flex:none;font-size:11px}
        .vd.pass{background:var(--green);color:#fff}
        .vd.fail{background:var(--red);color:#fff}
        @media (max-width:1000px){.pay-main{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="row between tiny" style={{ gap: 10 }}>
      <span className="muted">{k}</span>
      <b className="mono" style={{ textAlign: "right", wordBreak: "break-all" }}>{v}</b>
    </div>
  );
}
