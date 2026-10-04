"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ME, type Criterion } from "@/lib/data";
import { api } from "@/lib/api";
import { payLinkWithTicket } from "@/lib/ticket-client";
import { Capi } from "@/components/Capi";
import { Icon } from "@/components/Icon";
import { BriefDrafter } from "@/components/DraftContract";
import { Avatar, Confetti, Country, LangSwitch, Logo, Product, ThemeSwitch } from "@/components/ui";


export default function PublicOrderPage() {
  const { t, money, lang } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brief, setBrief] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [budget, setBudget] = useState<number | "">("");
  const [sent, setSent] = useState(false);
  const [fire, setFire] = useState(0);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; payUrl: string; ticket?: string } | null>(null);

  /** Public client form → real escrow order + payment link (no account required). */
  const submit = async () => {
    setSending(true);
    setErr(null);
    const res = await api.createOrder({
      direction: "from_client",
      brief,
      amount: Number(budget) || undefined,
      currency: "USD",
      lang,
      client: { name: name.trim(), email: email.trim() },
      criteria,
    });
    setSending(false);
    if (!res.ok) {
      setErr(res.error ?? "Something went wrong — please try again.");
      return;
    }
    setCreated({ id: res.data.order.id, payUrl: payLinkWithTicket(res.data.payUrl, res.data.order.id, res.data.ticket), ticket: res.data.ticket });
    setSent(true);
    setFire((f) => f + 1);
  };

  const ready = name.trim().length > 1 && /\S+@\S+/.test(email) && criteria.length > 0 && Number(budget) > 0;
  const skills = [
    { s: t("pub.skill1"), c: "var(--pink-l)" }, { s: t("pub.skill2"), c: "var(--sky-l)" },
    { s: t("pub.skill3"), c: "var(--lemon-l)" }, { s: t("pub.skill4"), c: "var(--mint-l)" },
  ];

  return (
    <div>
      <header className="pub-nav">
        <Logo />
        <div className="row" style={{ gap: 10 }}>
          <ThemeSwitch />
          <LangSwitch compact />
          <Link href="/dashboard" className="btn sm">{t("pub.imSari")}</Link>
        </div>
      </header>

      <main className="pub-main">
        {/* profile */}
        <aside className="card pub-profile rise">
          <div className="pub-cover">
            {(["mug", "shoe", "candle", "plant"] as const).map((k, i) => (
              <span key={k} className="pub-cover-thumb float" style={{ left: `${8 + i * 23}%`, transform: `rotate(${[-8, 6, -4, 9][i]}deg)`, animationDelay: `${i * 0.4}s` }}>
                <Product kind={k} />
              </span>
            ))}
          </div>
          <div style={{ padding: "0 22px 22px" }}>
            <div style={{ marginTop: -36, position: "relative", zIndex: 2 }}><Avatar p={ME} size={78} /></div>
            <h1 style={{ fontSize: 28, marginTop: 10 }}>{ME.name}</h1>
            <div className="row tiny muted" style={{ gap: 6, marginTop: 4, fontWeight: 700 }}>
              <Icon name="globe" size={14} /> {ME.city} <Country code={ME.country} /> · EN / ID / 中文
            </div>
            <p style={{ marginTop: 12, lineHeight: 1.55 }}>{t("pub.bio")}</p>
            <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
              {skills.map((x) => <span key={x.s} className="chip" style={{ background: x.c }}>{x.s}</span>)}
            </div>
            <div className="pub-stats">
              <div><b className="display">4.9</b><span><Icon name="star" size={13} /> {t("pub.rating")}</span></div>
              <div><b className="display">86</b><span>{t("pub.done")}</span></div>
              <div><b className="display">1.8d</b><span>{t("pub.release")}</span></div>
            </div>
            <div className="pub-protect">
              <Icon name="shield" size={22} />
              <div><b>{t("pub.protectT")}</b><div className="tiny" style={{ marginTop: 2 }}>{t("pub.protectB")}</div></div>
            </div>
          </div>
        </aside>

        {/* order form */}
        <section className="card pad rise" style={{ animationDelay: ".1s", position: "relative" }}>
          {!sent ? (
            <>
              <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                <div className="grow">
                  <span className="sticker" style={{ background: "var(--lemon)", transform: "rotate(-2deg)", fontSize: 14 }}>{t("pub.kicker")}</span>
                  <h2 style={{ fontSize: 32, marginTop: 12 }}>{t("pub.title", { name: ME.name.split(" ")[0] })}</h2>
                  <p className="muted" style={{ marginTop: 6 }}>{t("pub.sub")}</p>
                </div>
                <Capi size={80} mood="wink" />
              </div>

              <div className="pub-form">
                <div className="field">
                  <label htmlFor="n">{t("pub.yourName")}</label>
                  <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="James Miller" />
                </div>
                <div className="field">
                  <label htmlFor="e">{t("pub.yourEmail")}</label>
                  <input id="e" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="james@shop.com" />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <BriefDrafter brief={brief} setBrief={setBrief} example={t("ex.fromClient")} placeholder={t("pub.briefPh")}
                  onDrafted={(r) => { setCriteria(r.criteria); if (r.amount) setBudget(r.amount); if (!name) { setName("James Miller"); setEmail("james@shop.com"); } }} />
              </div>

              <div className="pub-form" style={{ marginTop: 16, alignItems: "end" }}>
                <div className="field">
                  <label htmlFor="b">{t("pub.budget")}</label>
                  <input id="b" type="number" min={1} className="input" value={budget} onChange={(e) => setBudget(e.target.value ? Number(e.target.value) : "")} placeholder="150" />
                </div>
                <button className="btn pink lg" disabled={!ready || sending} onClick={submit}>
                  {sending
                    ? <><span className="spin" style={{ width: 16, height: 16, border: "2.5px solid var(--ink)", borderTopColor: "transparent", borderRadius: "50%" }} /> Drafting the contract…</>
                    : <><Icon name="send" size={18} /> {t("pub.send")}</>}
                </button>
              </div>
              {err && <p className="tiny" style={{ marginTop: 10, color: "var(--red)" }}>{err}</p>}
              <p className="tiny muted" style={{ marginTop: 10 }}>{t("pub.noPayYet")}</p>
            </>
          ) : (
            <div className="col pop-in" style={{ alignItems: "center", textAlign: "center", gap: 12, padding: "30px 10px" }}>
              <Capi size={130} mood="love" motion="jump" />
              <h2 style={{ fontSize: 32 }}>{t("pub.sentT")}</h2>
              <p className="muted" style={{ maxWidth: 440 }}>{t("pub.sentB", { name: ME.name.split(" ")[0], email })}</p>
              <div className="pub-steps">
                {[t("pub.next1"), t("pub.next2", { amount: money(Number(budget) || 0) }), t("pub.next3")].map((s, i) => (
                  <div key={i} className="row" style={{ gap: 10, textAlign: "left" }}>
                    <span className="pub-n" style={{ background: ["var(--lemon)", "var(--sky)", "var(--mint)"][i] }}>{i + 1}</span>
                    <span style={{ fontWeight: 700 }}>{s}</span>
                  </div>
                ))}
              </div>
              {created && (
                <div className="card pad" style={{ background: "var(--paper)", maxWidth: 520, width: "100%" }}>
                  <div className="kbd">Escrow ready · {created.id}</div>
                  <p className="tiny" style={{ margin: "8px 0 10px" }}>
                    The contract is drafted and locked. Fund the escrow with PayPal — {ME.name.split(" ")[0]} only gets paid when
                    every criterion below passes:
                  </p>
                  <div className="row wrap" style={{ gap: 8, justifyContent: "center" }}>
                    <Link href={`/pay/${created.id}`} className="btn paypal lg"><Icon name="lock" size={16} /> {t("pub.next2", { amount: money(Number(budget) || 0) })}</Link>
                  </div>
                </div>
              )}
              <div className="row wrap" style={{ gap: 10, justifyContent: "center", marginTop: 8 }}>
                <Link href={created ? `/orders/${created.id}` : "/orders?tab=from_client"} className="btn ink">{t("pub.seeAsSari")} <Icon name="right" size={16} /></Link>
                <button className="btn" onClick={() => { setSent(false); setBrief(""); setCriteria([]); setCreated(null); }}>{t("pub.another")}</button>
              </div>
            </div>
          )}
        </section>
      </main>

      <Confetti fire={fire} />

      <style>{`
        .pub-nav{display:flex;justify-content:space-between;align-items:center;max-width:1180px;margin:0 auto;padding:18px 24px}
        .pub-main{max-width:1180px;margin:0 auto;padding:10px 24px 60px;display:grid;grid-template-columns:380px 1fr;gap:24px;align-items:start}
        .pub-profile{overflow:hidden;position:sticky;top:20px}
        .pub-cover{height:120px;background:var(--pink);border-bottom:2.5px solid var(--ink);position:relative;overflow:hidden;
          background-image:radial-gradient(rgba(255,255,255,.5) 2px,transparent 2px);background-size:16px 16px}
        .pub-cover-thumb{position:absolute;top:22px;width:62px;height:62px;border-radius:14px;overflow:hidden;border:2.5px solid var(--ink);box-shadow:3px 3px 0 var(--ink)}
        .pub-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px}
        .pub-stats div{border:2.5px solid var(--ink);border-radius:14px;padding:10px;text-align:center;background:var(--cream)}
        .pub-stats b{display:block;font-size:22px}
        .pub-stats span{font-size:11.5px;font-weight:800;color:var(--ink-2);display:inline-flex;gap:3px;align-items:center}
        .pub-protect{display:flex;gap:12px;align-items:flex-start;margin-top:16px;padding:12px 14px;border-radius:14px;border:2.5px solid var(--ink);background:var(--mint-l)}
        .pub-form{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}
        .pub-steps{display:flex;flex-direction:column;gap:10px;margin-top:6px;padding:16px;border:2.5px solid var(--ink);border-radius:16px;background:var(--cream)}
        .pub-n{width:28px;height:28px;border-radius:50%;border:2.5px solid var(--ink);display:grid;place-items:center;font-weight:900;flex:none}
        @media (max-width:960px){.pub-main{grid-template-columns:1fr}.pub-profile{position:static}}
        @media (max-width:560px){.pub-form{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
