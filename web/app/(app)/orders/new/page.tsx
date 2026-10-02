"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Criterion } from "@/lib/data";
import { Capi } from "@/components/Capi";
import { Icon } from "@/components/Icon";
import { BriefDrafter, CriteriaList } from "@/components/DraftContract";
import { Confetti, Toast } from "@/components/ui";

const FEE = 0.025;

export default function NewOrder() {
  const { t, money } = useI18n();
  const [step, setStep] = useState(0);
  const [client, setClient] = useState({ name: "", email: "", country: "JP", currency: "USD" });
  const [brief, setBrief] = useState("");
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [amount, setAmount] = useState(120);
  const [due, setDue] = useState("2026-11-13");
  const [win, setWin] = useState(72);
  const [newCrit, setNewCrit] = useState("");
  const [fire, setFire] = useState(0);
  const [copied, setCopied] = useState(false);

  const steps = [t("new.s1"), t("new.s2"), t("new.s3"), t("new.s4")];
  const canNext = [client.name.trim().length > 1 && /\S+@\S+/.test(client.email), criteria.length > 0, amount > 0 && criteria.length > 0, true][step];

  const next = () => {
    const n = Math.min(3, step + 1);
    setStep(n);
    if (n === 3) setFire((f) => f + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="col" style={{ gap: 22, maxWidth: 920 }}>
      <div>
        <Link href="/orders?tab=to_client" className="btn sm ghost" style={{ marginLeft: -10 }}><Icon name="left" size={15} /> {t("nav.orders")}</Link>
        <h1 style={{ fontSize: 34, marginTop: 6 }}>{t("new.title")}</h1>
        <p className="muted" style={{ marginTop: 4 }}>{t("new.sub")}</p>
      </div>

      {/* Progress track with Capi walking along */}
      <div className="card pad" style={{ padding: "26px 26px 18px" }}>
        <div className="ptrack">
          <div className="ptrack-line"><div style={{ width: `${(step / 3) * 100}%` }} /></div>
          <div className="ptrack-capi" style={{ left: `${(step / 3) * 100}%` }}>
            <Capi key={step} size={44} mood={step === 3 ? "love" : "happy"} motion="jump" />
          </div>
          {steps.map((s, i) => (
            <div key={s} className="pdot-wrap" style={{ left: `${(i / 3) * 100}%` }}>
              <span className={`pdot ${i <= step ? "on" : ""}`} style={{ background: i <= step ? ["var(--lemon)", "var(--lav)", "var(--sky)", "var(--mint)"][i] : "var(--paper)" }}>
                {i < step ? <Icon name="check" size={14} stroke={3} /> : i + 1}
              </span>
              <span className="plabel">{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1 — client */}
      {step === 0 && (
        <section key="s0" className="card pad rise">
          <h2 style={{ fontSize: 24 }}>{t("new.clientT")}</h2>
          <p className="muted" style={{ marginTop: 4, marginBottom: 18 }}>{t("new.clientB")}</p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cn">{t("new.clientName")}</label>
              <input id="cn" className="input" placeholder="Aiko Tanaka" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ce">{t("new.clientEmail")}</label>
              <input id="ce" type="email" className="input" placeholder="aiko@studio.jp" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="cc">{t("new.clientCountry")}</label>
              <select id="cc" className="select" value={client.country} onChange={(e) => setClient({ ...client, country: e.target.value })}>
                {["US", "GB", "DE", "JP", "SG", "AU", "CN", "KR", "ES", "IT", "NL", "CA"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cur">{t("new.currency")}</label>
              <select id="cur" className="select" value={client.currency} onChange={(e) => setClient({ ...client, currency: e.target.value })}>
                {["USD", "EUR", "GBP", "AUD", "SGD", "JPY"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button className="btn sm" style={{ marginTop: 16 }} onClick={() => setClient({ name: "Aiko Tanaka", email: "aiko@studio.jp", country: "JP", currency: "USD" })}>
            <Icon name="sparkles" size={15} /> {t("new.fillDemo")}
          </button>
        </section>
      )}

      {/* STEP 2 — brief + AI */}
      {step === 1 && (
        <section key="s1" className="card pad rise">
          <h2 style={{ fontSize: 24 }}>{t("new.jobT")}</h2>
          <p className="muted" style={{ marginTop: 4, marginBottom: 18 }}>{t("new.jobB")}</p>
          <BriefDrafter
            brief={brief}
            setBrief={setBrief}
            example={t("ex.toClient")}
            placeholder={t("new.briefPh")}
            onDrafted={(r) => { setCriteria(r.criteria); if (r.amount) setAmount(r.amount); setTitle(r.title); }}
          />
        </section>
      )}

      {/* STEP 3 — contract */}
      {step === 2 && (
        <section key="s2" className="contract rise">
          <div className="contract-head">
            <div className="grow">
              <div className="kbd">{t("new.agreement")}</div>
              <input className="contract-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t("new.orderTitle")} />
            </div>
            <span className="badge" style={{ background: "var(--lemon)" }}>{t("new.draft")}</span>
          </div>

          <div className="form-grid" style={{ marginTop: 18 }}>
            <div className="field">
              <label htmlFor="amt">{t("new.amount")} ({client.currency})</label>
              <input id="amt" type="number" min={1} className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="due">{t("new.due")}</label>
              <input id="due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>{t("new.window")}</label>
              <div className="row wrap" style={{ gap: 8 }}>
                {[24, 48, 72].map((h) => (
                  <button key={h} type="button" className={`chip ${win === h ? "on" : ""}`} onClick={() => setWin(h)}>{h} {t("new.hours")}</button>
                ))}
              </div>
              <span className="tiny muted">{t("new.windowHint", { h: win })}</span>
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <CriteriaList criteria={criteria} onRemove={(i) => setCriteria(criteria.filter((_, j) => j !== i))} />
            <form className="row" style={{ gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (newCrit.trim()) { setCriteria([...criteria, { label: newCrit.trim(), rule: "LLM review", icon: "text" }]); setNewCrit(""); } }}>
              <input className="input" placeholder={t("new.addCrit")} value={newCrit} onChange={(e) => setNewCrit(e.target.value)} />
              <button className="btn sm" type="submit"><Icon name="plus" size={15} /></button>
            </form>
          </div>

          <div className="money-box">
            <div className="row between"><span>{t("new.clientPays")}</span><b>{money(amount * (1 + FEE), client.currency)}</b></div>
            <div className="row between tiny muted"><span>{t("new.fee")}</span><span>{money(amount * FEE, client.currency)}</span></div>
            <div className="row between" style={{ marginTop: 6, paddingTop: 8, borderTop: "2px dashed rgba(35,25,66,.2)" }}>
              <span style={{ fontWeight: 800 }}>{t("new.youGet")}</span>
              <b className="display" style={{ fontSize: 24, color: "var(--green)" }}>{money(amount, client.currency)}</b>
            </div>
          </div>
        </section>
      )}

      {/* STEP 4 — sent! */}
      {step === 3 && (
        <section key="s3" className="card rise sent">
          <div className="col" style={{ alignItems: "center", textAlign: "center", gap: 10 }}>
            <Capi size={120} mood="love" motion="jump" />
            <h2 style={{ fontSize: 32 }}>{t("new.sentT")}</h2>
            <p className="muted" style={{ maxWidth: 480 }}>{t("new.sentB", { name: client.name || "your client" })}</p>
          </div>

          <div className="row wrap" style={{ gap: 10, justifyContent: "center", marginTop: 20 }}>
            <code className="share-link2">lunas.app/pay/LNS-0152</code>
            <button className="btn lemon" onClick={async () => { try { await navigator.clipboard.writeText("https://lunas.app/pay/LNS-0152"); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
              <Icon name="copy" size={16} /> {t("new.copy")}
            </button>
            <button className="btn"><Icon name="mail" size={16} /> {t("new.email")}</button>
          </div>

          <div className="preview card">
            <div className="kbd">{t("new.previewT")}</div>
            <div className="row between" style={{ marginTop: 10 }}>
              <div>
                <div className="display" style={{ fontSize: 20 }}>{title || "New order"}</div>
                <div className="tiny muted">{t("new.from")} Sari W. · Yogyakarta</div>
              </div>
              <div className="display" style={{ fontSize: 26 }}>{money(amount * (1 + FEE), client.currency)}</div>
            </div>
            <div className="tiny" style={{ margin: "10px 0 12px", fontWeight: 700 }}>✓ {t("new.previewProtect", { h: win })}</div>
            <div className="btn paypal" aria-hidden>{t("pay.with")} <i>Pay<b>Pal</b></i></div>
          </div>

          <div className="row wrap" style={{ gap: 10, justifyContent: "center", marginTop: 22 }}>
            <Link href="/orders/LNS-0151" className="btn ink">{t("new.goOrder")} <Icon name="right" size={16} /></Link>
            <button className="btn" onClick={() => { setStep(0); setBrief(""); setCriteria([]); setTitle(""); }}>{t("new.another")}</button>
          </div>
        </section>
      )}

      {step < 3 && (
        <div className="row between">
          <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}><Icon name="left" size={16} /> {t("common.back")}</button>
          <button className={`btn ${step === 2 ? "pink" : "ink"}`} disabled={!canNext} onClick={next}>
            {step === 2 ? <><Icon name="send" size={16} /> {t("new.send")}</> : <>{t("common.next")} <Icon name="right" size={16} /></>}
          </button>
        </div>
      )}

      <Confetti fire={fire} />
      <Toast show={copied}><Icon name="check" size={18} /> <b>{t("toast.copied")}</b></Toast>

      <style>{`
        .ptrack{position:relative;height:84px;margin:0 30px}
        .ptrack-line{position:absolute;left:0;right:0;top:52px;height:8px;border-radius:8px;border:2px solid var(--ink);background:var(--paper);overflow:hidden}
        .ptrack-line div{height:100%;background:repeating-linear-gradient(45deg,var(--pink) 0 10px,var(--lemon) 10px 20px);transition:width .6s var(--ease)}
        .ptrack-capi{position:absolute;top:-16px;transform:translateX(-50%);transition:left .6s var(--ease);z-index:2}
        .pdot-wrap{position:absolute;top:42px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px}
        .pdot{width:30px;height:30px;border-radius:50%;border:2.5px solid var(--ink);display:grid;place-items:center;font-weight:900;font-size:13px;transition:.3s var(--spring)}
        .pdot.on{transform:scale(1.1);box-shadow:2px 2px 0 var(--ink)}
        .plabel{font-size:12.5px;font-weight:800;white-space:nowrap}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .contract{background:#FFFEFA;border:2.5px solid var(--ink);border-radius:22px;box-shadow:6px 6px 0 var(--ink);padding:28px;
          background-image:linear-gradient(transparent 31px,rgba(35,25,66,.05) 32px);background-size:100% 32px}
        .contract-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:14px;border-bottom:2.5px solid var(--ink)}
        .contract-title{font-family:var(--font-display);font-weight:600;font-size:26px;border:none;background:transparent;outline:none;width:100%;margin-top:4px;border-bottom:2px dashed transparent}
        .contract-title:focus{border-bottom-color:var(--lav)}
        .money-box{margin-top:22px;background:var(--mint-l);border:2.5px solid var(--ink);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
        .sent{padding:30px;background:var(--lemon-l)}
        .share-link2{background:var(--paper);border:2.5px dashed var(--ink);border-radius:12px;padding:10px 14px;font-weight:800}
        .preview{max-width:440px;margin:24px auto 0;padding:18px;transform:rotate(-1deg)}
        @media (max-width:640px){.form-grid{grid-template-columns:1fr}.plabel{font-size:10.5px}.ptrack{margin:0 14px}}
      `}</style>
    </div>
  );
}
