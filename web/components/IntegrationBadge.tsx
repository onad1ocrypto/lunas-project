"use client";

/**
 * Honesty badge: shows whether this deployment is wired to real PayPal/AI or running in
 * simulation mode. Judges should never have to guess which one they are looking at.
 */

import { useEffect, useState } from "react";
import { api, type Health } from "@/lib/api";

export function IntegrationBadge({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.health().then((r) => {
      if (alive && r.ok) setHealth(r.data as Health);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!health) return null;

  const paypalReal = health.paypal === "sandbox" || health.paypal === "live";
  const aiReal = health.ai === "live";
  const label = compact
    ? `${paypalReal ? "PayPal" : "PayPal sim"} · ${aiReal ? "AI" : "AI heuristic"}`
    : `${paypalReal ? `PayPal ${health.paypal}` : "PayPal simulated"} · ${aiReal ? health.aiModel ?? "AI live" : "AI heuristic"}`;

  return (
    <div className="ib-wrap">
      <button className="ib-pill" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Integration status">
        <span className={`ib-dot ${paypalReal ? "on" : "sim"}`} />
        <span className={`ib-dot ${aiReal ? "on" : "sim"}`} />
        <span className="ib-label">{label}</span>
      </button>

      {open && (
        <div className="ib-pop card" role="dialog" aria-label="Integration status">
          <b>Integration status</b>
          <div className="col" style={{ gap: 6, marginTop: 8 }}>
            {Object.entries(health.checks ?? {}).map(([k, v]) => (
              <div key={k} className="row between tiny" style={{ gap: 12 }}>
                <span className="mono" style={{ color: "var(--ink-2)" }}>{k}</span>
                <b style={{ textAlign: "right" }}>{v}</b>
              </div>
            ))}
            <div className="row between tiny" style={{ gap: 12 }}>
              <span className="mono" style={{ color: "var(--ink-2)" }}>payout receiver</span>
              <b style={{ textAlign: "right", wordBreak: "break-all" }}>{health.payoutReceiver}</b>
            </div>
          </div>
          <a className="btn sm ghost" style={{ marginTop: 10 }} href="/api/health" target="_blank" rel="noreferrer">
            Raw <code>/api/health</code>
          </a>
        </div>
      )}

      <style>{`
        .ib-wrap{position:relative}
        .ib-pill{display:flex;align-items:center;gap:7px;padding:7px 11px;border:2.5px solid var(--ink);border-radius:999px;background:var(--paper);font-weight:800;font-size:12px;box-shadow:2px 2px 0 var(--ink);cursor:pointer}
        .ib-pill:hover{transform:translateY(-1px)}
        .ib-dot{width:9px;height:9px;border-radius:50%;border:1.5px solid var(--ink)}
        .ib-dot.on{background:var(--green)}
        .ib-dot.sim{background:var(--lemon)}
        .ib-label{white-space:nowrap}
        .ib-pop{position:absolute;right:0;top:calc(100% + 10px);width:min(340px,80vw);padding:14px;z-index:40;box-shadow:6px 6px 0 var(--ink)}
        @media (max-width:900px){.ib-label{display:none}}
        @media (max-width:620px){.ib-wrap{display:none}}
      `}</style>
    </div>
  );
}
